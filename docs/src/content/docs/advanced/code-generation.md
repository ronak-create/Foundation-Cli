---
title: Code Generation
description: How foundation generate works - model and CRUD generation across ORMs
---



The `foundation generate` command creates ORM-aware code for models and CRUD endpoints.

## Generation Types

| Type | What it generates |
|------|-------------------|
| `model` | ORM schema file (schema.prisma, entity, model) |
| `crud` | Model + service + controller + routes |

## Flow

1. **Bootstrap ORM** — Run `onRegister` hooks for ORM module
2. **Prompt Fields** — Interactive prompts for field definitions
3. **Register Model** — Call `orm.registerModel()`
4. **Build Schema** — Call `orm.buildSchemaFiles()`
5. **Write Files** — Write via FileTransaction
6. **CRUD** — For CRUD: generate backend-specific templates

## Field Definition

Interactive prompts for each field:

- Name (PascalCase, e.g., `userId`)
- Type (`string`, `number`, `boolean`, `date`, `uuid`)
- Required (`true`/`false`)
- Unique (`true`/`false`)

Auto-added fields:
- `id` — UUID primary key
- `createdAt` — timestamp
- `updatedAt` — timestamp

## Generated Output

### Prisma

```prisma
model Post {
  id        String   @id @default(uuid())
  title     String
  content   String?
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### TypeORM

```typescript
@Entity()
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  content: string;

  @Column()
  authorId: string;

  @ManyToOne(() => User, user => user.posts)
  @JoinColumn({ name: 'authorId' })
  author: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Mongoose

```typescript
@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true })
  title: string;

  @Prop()
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  author: User;
}

export const PostSchema = SchemaFactory.createForClass(Post);
```

### SQLAlchemy (FastAPI)

```python
class Post(Base):
    __tablename__ = "posts"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    title = Column(String, nullable=False)
    content = Column(String)
    author_id = Column(String, ForeignKey("users.id"))
    
    author = relationship("User", back_populates="posts")
```

## CI Mode

For non-interactive generation:

```bash
FOUNDATION_AI_FIELDS="name:string,email:string,password:string" foundation generate model User
```

Format: `field:type,field:type,...`

## Related

- [CLI: generate](/cli/generate/)
- [ORM Integration](/advanced/orm-integration/)
- [Modules: ORM](/modules/orm/)
