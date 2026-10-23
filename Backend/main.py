from fastapi import FastAPI, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import os

app = FastAPI(title="NeoStats Collaborative Project Management API")

# Enable CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Absolute Path: Hamesha exact Backend folder wali project_mgmt.db se connect karega
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "project_mgmt.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_and_autoseed_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Ensure Tables Exist
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'project_manager', 'team_member', 'viewer')),
            is_active INTEGER DEFAULT 1
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived')),
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES users (id)
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS project_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            project_role TEXT DEFAULT 'member',
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(project_id, user_id)
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
            priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
            assigned_to INTEGER,
            version INTEGER DEFAULT 1,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_to) REFERENCES users (id)
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
    """)

    # 2. Auto-seed if database is fresh/empty
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]

    if count == 0:
        print("🌱 Database empty. Seeding permanent default accounts and projects...")
        users = [
            (1, "Aditi Sharma (Admin)", "admin@neostats.com", "admin123", "admin", 1),
            (2, "Priya Verma (PM)", "pm@neostats.com", "pm123", "project_manager", 1),
            (3, "Rahul Singh (Dev)", "dev@neostats.com", "dev123", "team_member", 1),
            (4, "Vikram Mehta (Viewer)", "viewer@neostats.com", "viewer123", "viewer", 1)
        ]
        cursor.executemany("INSERT INTO users (id, name, email, password, role, is_active) VALUES (?, ?, ?, ?, ?, ?)", users)

        projects = [
            (1, "Analytics Microservices Migration", "Decouple monolithic reports into event-driven FastAPI microservices.", "active", 2),
            (2, "Internal Design System Revamp", "Unified Tailwind UI component kit across internal tools.", "active", 1)
        ]
        cursor.executemany("INSERT INTO projects (id, title, description, status, created_by) VALUES (?, ?, ?, ?, ?)", projects)

        members = [
            (1, 2, "manager"),
            (1, 3, "contributor"),
            (1, 4, "observer"),
            (2, 1, "lead"),
            (2, 3, "contributor")
        ]
        cursor.executemany("INSERT INTO project_members (project_id, user_id, project_role) VALUES (?, ?, ?)", members)

        tasks = [
            (1, "Setup Database Connection Pool", "Configure SQLite optimized pragmas and connections.", "done", "high", 2, 1),
            (1, "Implement RBAC Middleware", "Enforce 403 checks across all mutating endpoints.", "in_progress", "high", 3, 1),
            (1, "Write Concurrency 409 Tests", "Verify version collision on simultaneous edits.", "todo", "medium", 3, 1),
            (2, "Audit Color Palette Contrast", "Verify WCAG 2.1 compliance for Dark/Light theme.", "todo", "low", 3, 1)
        ]
        cursor.executemany("INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, version) VALUES (?, ?, ?, ?, ?, ?, ?)", tasks)

        comments = [
            (2, 2, "Ensure server returns HTTP 403 on role mismatch, not just hiding UI elements."),
            (2, 3, "Verified! Custom role guards are checking request headers properly.")
        ]
        cursor.executemany("INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)", comments)

    conn.commit()
    conn.close()

@app.on_event("startup")
def on_startup():
    init_and_autoseed_db()

# --- Schemas ---
class LoginSchema(BaseModel):
    email: str
    password: str

class UserCreateSchema(BaseModel):
    name: str
    email: str
    password: str = "password123"
    role: str

class ProjectCreateSchema(BaseModel):
    title: str
    description: Optional[str] = ""

class MemberAddSchema(BaseModel):
    user_id: int
    project_role: Optional[str] = "contributor"

class TaskCreateSchema(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "medium"
    assigned_to: Optional[int] = None

class TaskUpdateSchema(BaseModel):
    title: str
    description: Optional[str] = ""
    status: str
    priority: str
    assigned_to: Optional[int] = None
    version: int

class CommentCreateSchema(BaseModel):
    content: str

# --- RBAC Auth Guards ---
def get_current_user(x_user_id: Optional[str] = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required: X-User-Id header missing")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, role, is_active FROM users WHERE id = ?", (x_user_id,))
    user = cursor.fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="User account is deactivated")
    return dict(user)

def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail=f"Forbidden: {current_user['role']} not authorized for this operation")
        return current_user
    return role_checker

# --- Endpoints ---

# Auth & Users
@app.post("/api/auth/login")
def login(payload: LoginSchema):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, role, is_active FROM users WHERE email = ? AND password = ?", (payload.email, payload.password))
    user = cursor.fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account deactivated")
    return dict(user)

@app.get("/api/users")
def get_users(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, role, is_active FROM users")
    users = [dict(u) for u in cursor.fetchall()]
    conn.close()
    return users

@app.post("/api/users")
def create_user(payload: UserCreateSchema, current_user: dict = Depends(require_roles(["admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
                       (payload.name, payload.email, payload.password, payload.role))
        conn.commit()
        new_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")
    conn.close()
    return {"id": new_id, "message": "User created successfully"}

@app.patch("/api/users/{user_id}/status")
def toggle_user_status(user_id: int, is_active: int, current_user: dict = Depends(require_roles(["admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_active = ? WHERE id = ?", (is_active, user_id))
    conn.commit()
    conn.close()
    return {"message": "User status updated"}

# Projects
@app.get("/api/projects")
def get_projects(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, description, status, created_by FROM projects")
    projects = [dict(p) for p in cursor.fetchall()]
    conn.close()
    return projects

@app.post("/api/projects")
def create_project(payload: ProjectCreateSchema, current_user: dict = Depends(require_roles(["admin", "project_manager"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO projects (title, description, created_by) VALUES (?, ?, ?)",
                   (payload.title, payload.description, current_user["id"]))
    conn.commit()
    new_id = cursor.lastrowid
    cursor.execute("INSERT INTO project_members (project_id, user_id, project_role) VALUES (?, ?, 'lead')",
                   (new_id, current_user["id"]))
    conn.commit()
    conn.close()
    return {"id": new_id, "title": payload.title}

@app.patch("/api/projects/{project_id}/archive")
def archive_project(project_id: int, current_user: dict = Depends(require_roles(["admin", "project_manager"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE projects SET status = 'archived' WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()
    return {"message": "Project archived successfully"}

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, current_user: dict = Depends(require_roles(["admin"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()
    return {"message": "Project deleted successfully"}

# Members
@app.get("/api/projects/{project_id}/members")
def get_project_members(project_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.name, u.email, pm.project_role 
        FROM project_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = ?
    """, (project_id,))
    members = [dict(m) for m in cursor.fetchall()]
    conn.close()
    return members

@app.post("/api/projects/{project_id}/members")
def add_project_member(project_id: int, payload: MemberAddSchema, current_user: dict = Depends(require_roles(["admin", "project_manager"]))):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO project_members (project_id, user_id, project_role) VALUES (?, ?, ?)",
                       (project_id, payload.user_id, payload.project_role))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="User is already a member of this project")
    conn.close()
    return {"message": "Member added successfully"}

@app.delete("/api/projects/{project_id}/members/{user_id}")
def remove_project_member(project_id: int, user_id: int, current_user: dict = Depends(require_roles(["admin", "project_manager"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM project_members WHERE project_id = ? AND user_id = ?", (project_id, user_id))
    conn.commit()
    conn.close()
    return {"message": "Member removed"}

# Tasks & Concurrency Control
@app.get("/api/projects/{project_id}/tasks")
def get_project_tasks(project_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT t.id, t.project_id, t.title, t.description, t.status, t.priority, t.assigned_to, t.version, u.name as assignee_name
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.project_id = ?
    """, (project_id,))
    tasks = [dict(t) for t in cursor.fetchall()]
    conn.close()
    return tasks

@app.post("/api/projects/{project_id}/tasks")
def create_task(project_id: int, payload: TaskCreateSchema, current_user: dict = Depends(require_roles(["admin", "project_manager", "team_member"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tasks (project_id, title, description, priority, assigned_to, version)
        VALUES (?, ?, ?, ?, ?, 1)
    """, (project_id, payload.title, payload.description, payload.priority, payload.assigned_to))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "title": payload.title, "version": 1}

# HTTP 409 Conflict check for concurrent edits
@app.put("/api/tasks/{task_id}")
def update_task(task_id: int, payload: TaskUpdateSchema, current_user: dict = Depends(require_roles(["admin", "project_manager", "team_member"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT version FROM tasks WHERE id = ?", (task_id,))
    task = cursor.fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

    server_version = task["version"]
    if server_version != payload.version:
        conn.close()
        raise HTTPException(
            status_code=409,
            detail=f"Conflict: Task was updated by another user (Server version: {server_version}, your version: {payload.version}). Please refresh to get the latest state."
        )

    new_version = server_version + 1
    cursor.execute("""
        UPDATE tasks 
        SET title = ?, description = ?, status = ?, priority = ?, assigned_to = ?, version = ?
        WHERE id = ?
    """, (payload.title, payload.description, payload.status, payload.priority, payload.assigned_to, new_version, task_id))
    conn.commit()
    conn.close()
    return {"message": "Task updated successfully", "new_version": new_version}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, current_user: dict = Depends(require_roles(["admin", "project_manager"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"message": "Task deleted"}

# Comments
@app.get("/api/tasks/{task_id}/comments")
def get_task_comments(task_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.id, c.task_id, c.content, c.created_at, u.name as author_name
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.task_id = ?
        ORDER BY c.created_at ASC
    """, (task_id,))
    comments = [dict(c) for c in cursor.fetchall()]
    conn.close()
    return comments

@app.post("/api/tasks/{task_id}/comments")
def add_comment(task_id: int, payload: CommentCreateSchema, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)",
                   (task_id, current_user["id"], payload.content))
    conn.commit()
    conn.close()
    return {"message": "Comment posted"}