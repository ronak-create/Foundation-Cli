import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";
import type { ORMProvider, ORMModelDefinition, ORMFieldType } from "@systemlabs/foundation-core";
import { registerProviderFromContext } from "./provider-utils";

// ── Template strings ──────────────────────────────────────────────────────────

const DATABASE_PY = `from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

# Replace postgresql:// with postgresql+asyncpg:// for async driver
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(ASYNC_DATABASE_URL, echo=os.getenv("DEBUG") == "true")

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
`;

const MODELS_PY = `from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
`;

const ALEMBIC_INI = `[alembic]
script_location = alembic
prepend_sys_path = .
sqlalchemy.url = %(DATABASE_URL)s

[loggers]
keys = root,sqlalchemy,alembic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handlers]
keys = console

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatters]
keys = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
`;

// ── ORM Provider ──────────────────────────────────────────────────────────────

/** Maps portable field types to SQLAlchemy column types. */
const SA_TYPE_MAP: Record<ORMFieldType, string> = {
  string: "String",
  number: "Integer",
  boolean: "Boolean",
  date: "DateTime(timezone=True)",
  uuid: "String",
  json: "JSON",
};

/** Maps portable field types to Python type hints. */
const PY_TYPE_MAP: Record<ORMFieldType, string> = {
  string: "str",
  number: "int",
  boolean: "bool",
  date: "datetime",
  uuid: "str",
  json: "dict",
};

const sqlalchemyProvider: ORMProvider = {
  id: "orm-sqlalchemy",
  name: "SQLAlchemy",

  buildSchemaFiles(models: ReadonlyArray<ORMModelDefinition>) {
    return models.map((model) => {
      const tableName = `${model.name.toLowerCase()}s`;
      const className = model.name;
      const needsUuid = model.fields.some((f) => f.type === "uuid");
      const needsDate = model.fields.some((f) => f.type === "date");

      // Build import list
      const saTypes = new Set<string>(["String"]); // always need at least one
      for (const field of model.fields) {
        const saType = SA_TYPE_MAP[field.type]?.split("(")[0];
        if (saType) saTypes.add(saType);
      }
      // Always include timestamp imports
      saTypes.add("DateTime");
      saTypes.add("func");

      const columnLines: string[] = [];
      for (const field of model.fields) {
        const saType = SA_TYPE_MAP[field.type] ?? "String";
        const pyType = PY_TYPE_MAP[field.type] ?? "str";
        const saImport = saType.split("(")[0];
        if (saImport) saTypes.add(saImport);

        if (field.primaryKey) {
          if (field.type === "uuid" || field.type === "string") {
            columnLines.push(
              `    ${field.name}: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))`,
            );
          } else {
            columnLines.push(
              `    ${field.name}: Mapped[${pyType}] = mapped_column(${saType}, primary_key=True, autoincrement=True)`,
            );
          }
        } else {
          const opts: string[] = [];
          if (field.unique) opts.push("unique=True");
          if (field.required === false) opts.push("nullable=True");
          else opts.push("nullable=False");
          if (field.type === "date" && field.generated) opts.push("server_default=func.now()");

          const optStr = opts.length > 0 ? `, ${opts.join(", ")}` : "";
          columnLines.push(
            `    ${field.name}: Mapped[${pyType}] = mapped_column(${saType}${optStr})`,
          );
        }
      }

      // Standard timestamp columns
      const hasCreatedAt = model.fields.some((f) => f.name === "created_at");
      const hasUpdatedAt = model.fields.some((f) => f.name === "updated_at");
      if (!hasCreatedAt) {
        columnLines.push(
          `    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())`,
        );
      }
      if (!hasUpdatedAt) {
        columnLines.push(
          `    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())`,
        );
      }

      const saTypeList = Array.from(saTypes).sort().join(", ");
      const dateImport =
        needsDate || !hasCreatedAt || !hasUpdatedAt ? "from datetime import datetime\n" : "";
      const uuidImport = needsUuid ? "import uuid\n" : "";

      // ── Relations (SQLAlchemy relationship()) ─────────────────────────────
      const relationLines = (model.relations ?? []).map((rel) => {
        const isArray = rel.type === "one-to-many" || rel.type === "many-to-many";
        const cascade  = rel.cascade ? `, cascade="all, delete-orphan"` : "";
        return `    ${rel.name}: Mapped[${isArray ? `list["${rel.target}"]` : `"${rel.target}"`}] = relationship("${rel.target}"${cascade})`;
      });
      const relationshipImport = relationLines.length > 0 ? ", relationship" : "";

      const lines: string[] = [
        `# Generated by foundation-cli (source module: ${model.sourceModuleId})`,
        `${dateImport}from sqlalchemy import ${saTypeList}`,
        `from sqlalchemy.orm import Mapped, mapped_column${relationshipImport}`,
        `from .database import Base`,
        uuidImport.trimEnd(),
        "",
        "",
        `class ${className}(Base):`,
        `    __tablename__ = "${tableName}"`,
        "",
        ...columnLines,
        ...relationLines,
      ];

      return {
        relativePath: `src/${model.name.toLowerCase()}.py`,
        content: lines.filter((l, i) => !(i > 0 && l === "" && lines[i - 1] === "")).join("\n"),
        overwrite: true,
      };
    });
  },
};

// ── Module definition ─────────────────────────────────────────────────────────

export const sqlalchemyModule: PluginDefinition = {
  manifest: {
    id: "orm-sqlalchemy",
    name: "SQLAlchemy",
    version: "1.0.0",
    description: "SQLAlchemy 2.0 async ORM with Alembic migrations for Python backends",
    category: "orm",
    provides: ["orm", "database-client"],
    // requires: ["database"],
    runtime: "python",
    compatibility: {
      conflicts: ["orm-prisma", "orm-typeorm", "orm-mongoose"],
      compatibleWith: {
        backend: ["backend-fastapi", "backend-django"],
      },
    },
    dependencies: [
      { name: "sqlalchemy", version: "^2.0.0", scope: "dependencies" },
      { name: "alembic", version: "^1.13.0", scope: "dependencies" },
      { name: "asyncpg", version: "^0.29.0", scope: "dependencies" },
      { name: "python-dotenv", version: "^1.0.0", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/database.py", content: DATABASE_PY },
      { relativePath: "src/models.py", content: MODELS_PY },
      { relativePath: "alembic.ini", content: ALEMBIC_INI },
    ],
    configPatches: [
      {
        targetFile: "requirements.txt",
        merge: {
          sqlalchemy: ">=2.0.0",
          alembic: ">=1.13.0",
          asyncpg: ">=0.29.0",
          "python-dotenv": ">=1.0.0",
        },
      },
      {
        targetFile: ".env.example",
        merge: {
          DATABASE_URL: "postgresql://user:password@localhost:5432/<%= projectName %>",
        },
      },
    ],
    postInstallInstructions:
      "Run `alembic init alembic` then " +
      "`alembic revision --autogenerate -m 'init'` and " +
      "`alembic upgrade head` to apply migrations.",
  },

  hooks: {
    onRegister(ctx): Promise<void> {
      registerProviderFromContext(ctx, sqlalchemyProvider);
      return Promise.resolve();
    },
  },
};