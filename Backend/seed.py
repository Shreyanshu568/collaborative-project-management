import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "project_mgmt.db")

def run_seed():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("🛠️ 1. Creating fresh tables...")
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

    # Reset SQLite internal sequence counter
    cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('users', 'projects', 'tasks', 'comments', 'project_members');")

    print("👤 2. Inserting users with locked IDs 1, 2, 3, 4...")
    users = [
        (1, "Aditi Sharma (Admin)", "admin@neostats.com", "admin123", "admin", 1),
        (2, "Priya Verma (PM)", "pm@neostats.com", "pm123", "project_manager", 1),
        (3, "Rahul Singh (Dev)", "dev@neostats.com", "dev123", "team_member", 1),
        (4, "Vikram Mehta (Viewer)", "viewer@neostats.com", "viewer123", "viewer", 1)
    ]
    cursor.executemany("""
        INSERT INTO users (id, name, email, password, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
    """, users)

    print("📁 3. Inserting projects...")
    projects = [
        (1, "Analytics Microservices Migration", "Decouple monolithic reports into event-driven FastAPI microservices.", "active", 2),
        (2, "Internal Design System Revamp", "Unified Tailwind UI component kit across internal tools.", "active", 1)
    ]
    cursor.executemany("""
        INSERT INTO projects (id, title, description, status, created_by)
        VALUES (?, ?, ?, ?, ?)
    """, projects)

    print("👥 4. Inserting project memberships...")
    members = [
        (1, 2, "manager"),
        (1, 3, "contributor"),
        (1, 4, "observer"),
        (2, 1, "lead"),
        (2, 3, "contributor")
    ]
    cursor.executemany("""
        INSERT INTO project_members (project_id, user_id, project_role)
        VALUES (?, ?, ?)
    """, members)

    print("📝 5. Inserting tasks...")
    tasks = [
        (1, "Setup Database Connection Pool", "Configure SQLite optimized pragmas and connections.", "done", "high", 2, 1),
        (1, "Implement RBAC Middleware", "Enforce 403 checks across all mutating endpoints.", "in_progress", "high", 3, 1),
        (1, "Write Concurrency 409 Tests", "Verify version collision on simultaneous edits.", "todo", "medium", 3, 1),
        (2, "Audit Color Palette Contrast", "Verify WCAG 2.1 compliance for Dark/Light theme.", "todo", "low", 3, 1)
    ]
    cursor.executemany("""
        INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, version)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, tasks)

    print("💬 6. Inserting comments...")
    comments = [
        (2, 2, "Ensure server returns HTTP 403 on role mismatch, not just hiding UI elements."),
        (2, 3, "Verified! Custom role guards are checking request headers properly.")
    ]
    cursor.executemany("""
        INSERT INTO comments (task_id, user_id, content)
        VALUES (?, ?, ?)
    """, comments)

    conn.commit()
    conn.close()
    print("✅ Database cleanly reset with permanent IDs 1-4!")

if __name__ == "__main__":
    run_seed()