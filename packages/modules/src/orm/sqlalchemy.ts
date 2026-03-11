import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

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

// const REQUIREMENTS = `sqlalchemy>=2.0.0
// alembic>=1.13.0
// asyncpg>=0.29.0
// python-dotenv>=1.0.0
// `;

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
      { name: "sqlalchemy",    version: "^2.0.0", scope: "dependencies" },
      { name: "alembic",       version: "^1.13.0", scope: "dependencies" },
      { name: "asyncpg",       version: "^0.29.0", scope: "dependencies" },
      { name: "python-dotenv", version: "^1.0.0", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/database.py",  content: DATABASE_PY },
      { relativePath: "src/models.py",    content: MODELS_PY },
      { relativePath: "alembic.ini",      content: ALEMBIC_INI },
    ],
    configPatches: [
      {
        targetFile: "requirements.txt",
        merge: {
          sqlalchemy:    ">=2.0.0",
          alembic:       ">=1.13.0",
          asyncpg:       ">=0.29.0",
          "python-dotenv": ">=1.0.0",
        },
      },
      {
        targetFile: ".env.example",
        merge: { DATABASE_URL: "postgresql://user:password@localhost:5432/<%= projectName %>" },
      },
    ],
    postInstallInstructions: "Run `alembic init alembic` then `alembic revision --autogenerate -m 'init'` and `alembic upgrade head` to apply migrations.",
  },
};