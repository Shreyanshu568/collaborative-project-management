import React, { useState, useEffect } from "react";

const API_BASE = "http://127.0.0.1:8000/api";

const PRESET_USERS = {
  1: { id: 1, name: "Aditi Sharma", role: "admin", email: "admin@neostats.com" },
  2: { id: 2, name: "Priya Verma", role: "project_manager", email: "pm@neostats.com" },
  3: { id: 3, name: "Rahul Singh", role: "team_member", email: "dev@neostats.com" },
  4: { id: 4, name: "Vikram Mehta", role: "viewer", email: "viewer@neostats.com" },
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(PRESET_USERS[1]);
  const [allUsers, setAllUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  
  // Alert Banner State
  const [alert, setAlert] = useState(null);

  // Modals Visibility
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Active Task for Edit/Comments
  const [taskForm, setTaskForm] = useState({ id: null, title: "", description: "", status: "todo", priority: "medium", assigned_to: "", version: 1 });
  const [activeTaskComments, setActiveTaskComments] = useState({ task: null, list: [], newComment: "" });
  const [projectForm, setProjectForm] = useState({ title: "", description: "" });
  const [memberForm, setMemberForm] = useState({ user_id: "", project_role: "contributor" });
  const [newUserForm, setNewUserForm] = useState({ name: "", email: "", role: "team_member" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  // Centralized API Caller
  const apiCall = async (endpoint, method = "GET", body = null) => {
    try {
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id.toString(),
        },
      };
      if (body) options.body = JSON.stringify(body);

      const res = await fetch(`${API_BASE}${endpoint}`, options);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          showAlert(`🚨 409 Conflict Detected! ${data.detail}`, "conflict");
        } else if (res.status === 403) {
          showAlert(`⛔ 403 Forbidden! ${data.detail}`, "error");
        } else {
          showAlert(`⚠️ Error (${res.status}): ${data.detail || "Request failed"}`, "error");
        }
        return null;
      }
      return data;
    } catch (err) {
      showAlert("❌ Backend server not responding. Make sure FastAPI is running on port 8000.", "error");
      return null;
    }
  };

  const showAlert = (message, type = "info") => {
    setAlert({ message, type });
  };

  // Load Initial Data
  useEffect(() => {
    fetchUsers();
    fetchProjects();
  }, [currentUser]);

  const fetchUsers = async () => {
    const data = await apiCall("/users");
    if (data) setAllUsers(data);
  };

  const fetchProjects = async () => {
    const data = await apiCall("/projects");
    if (data) {
      setProjects(data);
      if (data.length > 0 && !selectedProject) {
        selectProject(data[0]);
      }
    }
  };

  const selectProject = async (proj) => {
    setSelectedProject(proj);
    fetchTasks(proj.id);
    fetchMembers(proj.id);
  };

  const fetchTasks = async (projId) => {
    const data = await apiCall(`/projects/${projId}/tasks`);
    if (data) setTasks(data);
  };

  const fetchMembers = async (projId) => {
    const data = await apiCall(`/projects/${projId}/members`);
    if (data) setMembers(data);
  };

  // Switch Quick User
  const handleSwitchUser = (uid) => {
    if (PRESET_USERS[uid]) {
      setCurrentUser(PRESET_USERS[uid]);
      showAlert(`Switched identity to ${PRESET_USERS[uid].name} (${PRESET_USERS[uid].role})`, "info");
    }
  };

  // Task Submission (Create / Update with Version Locking)
  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskForm.id) {
      // Create
      const res = await apiCall(`/projects/${selectedProject.id}/tasks`, "POST", {
        title: taskForm.title,
        description: taskForm.description,
        priority: taskForm.priority,
        assigned_to: taskForm.assigned_to ? parseInt(taskForm.assigned_to) : null,
      });
      if (res) {
        showAlert("✅ Task created successfully", "success");
        setShowTaskModal(false);
        fetchTasks(selectedProject.id);
      }
    } else {
      // Update with OCC Version check
      const res = await apiCall(`/tasks/${taskForm.id}`, "PUT", {
        title: taskForm.title,
        description: taskForm.description,
        status: taskForm.status,
        priority: taskForm.priority,
        assigned_to: taskForm.assigned_to ? parseInt(taskForm.assigned_to) : null,
        version: taskForm.version,
      });
      if (res) {
        showAlert(`✅ Task updated successfully! Version incremented to v${res.new_version}`, "success");
        setShowTaskModal(false);
        fetchTasks(selectedProject.id);
      }
    }
  };

  const openCreateTaskModal = () => {
    setTaskForm({ id: null, title: "", description: "", status: "todo", priority: "medium", assigned_to: "", version: 1 });
    setShowTaskModal(true);
  };

  const openEditTaskModal = (task) => {
    setTaskForm({
      id: task.id,
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to || "",
      version: task.version,
    });
    setShowTaskModal(true);
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Delete this task?")) return;
    const res = await apiCall(`/tasks/${taskId}`, "DELETE");
    if (res) {
      showAlert("Task deleted", "success");
      fetchTasks(selectedProject.id);
    }
  };

  // Comments
  const openComments = async (task) => {
    setActiveTaskComments({ task, list: [], newComment: "" });
    setShowCommentsModal(true);
    const data = await apiCall(`/tasks/${task.id}/comments`);
    if (data) setActiveTaskComments((prev) => ({ ...prev, list: data }));
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    const res = await apiCall(`/tasks/${activeTaskComments.task.id}/comments`, "POST", {
      content: activeTaskComments.newComment,
    });
    if (res) {
      const updated = await apiCall(`/tasks/${activeTaskComments.task.id}/comments`);
      if (updated) setActiveTaskComments((prev) => ({ ...prev, list: updated, newComment: "" }));
    }
  };

  // Projects
  const handleProjectSubmit = async (e) => {
    e.preventDefault();
    const res = await apiCall("/projects", "POST", projectForm);
    if (res) {
      showAlert("✅ Project created", "success");
      setShowProjectModal(false);
      setProjectForm({ title: "", description: "" });
      fetchProjects();
    }
  };

  const handleArchiveProject = async () => {
    if (!window.confirm("Archive this project?")) return;
    const res = await apiCall(`/projects/${selectedProject.id}/archive`, "PATCH");
    if (res) {
      showAlert("Project archived", "success");
      fetchProjects();
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm("Permanently delete this project?")) return;
    const res = await apiCall(`/projects/${selectedProject.id}`, "DELETE");
    if (res) {
      showAlert("Project deleted", "success");
      setSelectedProject(null);
      fetchProjects();
    }
  };

  // Members
  const handleAddMember = async (e) => {
    e.preventDefault();
    const res = await apiCall(`/projects/${selectedProject.id}/members`, "POST", {
      user_id: parseInt(memberForm.user_id),
      project_role: memberForm.project_role,
    });
    if (res) {
      showAlert("Member added", "success");
      setShowMemberModal(false);
      fetchMembers(selectedProject.id);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm("Remove member?")) return;
    const res = await apiCall(`/projects/${selectedProject.id}/members/${userId}`, "DELETE");
    if (res) {
      showAlert("Member removed", "success");
      fetchMembers(selectedProject.id);
    }
  };

  // Admin User Management
  const handleCreateUser = async (e) => {
    e.preventDefault();
    const res = await apiCall("/users", "POST", { ...newUserForm, password: "password123" });
    if (res) {
      showAlert("User created", "success");
      setNewUserForm({ name: "", email: "", role: "team_member" });
      fetchUsers();
    }
  };

  const handleToggleUserStatus = async (uid, newStatus) => {
    const res = await apiCall(`/users/${uid}/status?is_active=${newStatus}`, "PATCH");
    if (res) {
      showAlert("User status updated", "success");
      fetchUsers();
    }
  };

  // Formal Login
  const handleLogin = async (e) => {
    e.preventDefault();
    const res = await apiCall("/auth/login", "POST", loginForm);
    if (res) {
      setCurrentUser(res);
      setShowLoginModal(false);
      showAlert(`Logged in as ${res.name}`, "success");
    }
  };

  const isAdmin = currentUser.role === "admin";
  const isPM = currentUser.role === "project_manager";
  const isViewer = currentUser.role === "viewer";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-indigo-900 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-indigo-500 flex items-center justify-center font-black text-xl">N</div>
            <h1 className="text-xl font-bold tracking-tight">NeoStats Collab </h1>
          </div>

          {/* Quick Role Switcher */}
          <div className="flex items-center gap-2 bg-indigo-800/80 p-1.5 rounded-lg border border-indigo-700 text-xs">
            <span className="text-indigo-200 font-medium px-2">Role Switch:</span>
            {[1, 2, 3, 4].map((id) => (
              <button
                key={id}
                onClick={() => handleSwitchUser(id)}
                className={`px-2.5 py-1 rounded transition font-semibold ${
                  currentUser.id === id ? "bg-white text-indigo-900 font-bold shadow" : "hover:bg-indigo-700 text-white"
                }`}
              >
                {id === 1 ? "Admin" : id === 2 ? "PM" : id === 3 ? "Dev" : "Viewer"}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-3 text-sm">
            {isAdmin && (
              <button onClick={() => setShowUsersModal(true)} className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded font-semibold transition">
                👥 Manage Users
              </button>
            )}
            <button onClick={() => setShowLoginModal(true)} className="text-xs border border-indigo-400 hover:bg-indigo-800 text-white px-3 py-1.5 rounded font-semibold transition">
              🔑 Login
            </button>
            <div className="text-right">
              <div className="font-semibold text-white text-xs">{currentUser.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-indigo-300 font-bold">{currentUser.role.replace("_", " ")}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Alert Banner */}
      {alert && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className={`p-4 rounded-lg flex items-center justify-between shadow border ${
            alert.type === "conflict" ? "bg-amber-50 border-amber-300 text-amber-900" :
            alert.type === "error" ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-emerald-50 border-emerald-300 text-emerald-900"
          }`}>
            <div className="text-sm font-semibold">{alert.message}</div>
            <button onClick={() => setAlert(null)} className="text-slate-400 hover:text-slate-700 font-bold ml-4">✕</button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left: Projects & Team */}
        <aside className="md:col-span-1 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-slate-800 text-base">Projects</h2>
              {(isAdmin || isPM) && (
                <button onClick={() => setShowProjectModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded shadow">
                  + New
                </button>
              )}
            </div>
            <div className="space-y-2">
              {projects.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No projects found.</p>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => selectProject(p)}
                    className={`p-3 border rounded-lg cursor-pointer transition ${
                      selectedProject?.id === p.id ? "border-indigo-600 bg-indigo-50/50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-xs text-slate-800 truncate">{p.title}</h4>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${p.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Members */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 text-sm">Project Members</h3>
              {(isAdmin || isPM) && (
                <button onClick={() => setShowMemberModal(true)} className="text-xs text-indigo-600 font-semibold hover:underline">
                  + Add
                </button>
              )}
            </div>
            <div className="space-y-2 text-xs">
              {members.length === 0 ? (
                <p className="text-slate-400 italic">No members assigned.</p>
              ) : (
                members.map((m) => (
                  <div key={m.id} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
                    <div>
                      <span className="font-semibold text-slate-800">{m.name}</span>
                      <span className="text-[10px] text-slate-400 block">{m.project_role}</span>
                    </div>
                    {(isAdmin || isPM) && (
                      <button onClick={() => handleRemoveMember(m.id)} className="text-rose-500 hover:text-rose-700">✕</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Right: Tasks */}
        <section className="md:col-span-3 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-black text-slate-900">{selectedProject ? selectedProject.title : "Select a project"}</h2>
                {selectedProject && (
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase ${selectedProject.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                    {selectedProject.status}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">{selectedProject?.description}</p>
            </div>
            {selectedProject && (
              <div className="flex items-center gap-2">
                {(isAdmin || isPM) && (
                  <button onClick={handleArchiveProject} className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded font-semibold">
                    Archive
                  </button>
                )}
                {isAdmin && (
                  <button onClick={handleDeleteProject} className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded font-semibold">
                    Delete
                  </button>
                )}
                {(isAdmin || isPM) && (
                  <button onClick={openCreateTaskModal} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5 rounded shadow">
                    + Create Task
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Tasks</h3>
              <span className="text-xs font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{tasks.length}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.length === 0 ? (
                <div className="col-span-full py-8 text-center text-sm text-slate-400">No tasks created yet.</div>
              ) : (
                tasks.map((t) => (
                  <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow transition flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                          t.priority === "high" ? "bg-rose-50 text-rose-700 border-rose-200" :
                          t.priority === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>{t.priority}</span>
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">v{t.version}</span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-800 leading-snug">{t.title}</h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description || "No description"}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Assignee:</span>
                        <span className="font-medium text-slate-700">{t.assignee_name || "Unassigned"}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Status:</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-slate-100 text-slate-700">
                          {t.status.replace("_", " ")}
                        </span>
                      </div>

                      <div className="flex justify-end items-center gap-1 mt-2 pt-2 border-t border-slate-50">
                        <button onClick={() => openComments(t)} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-1">💬 Discuss</button>
                        {!isViewer && (
                          <button onClick={() => openEditTaskModal(t)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1 rounded">
                            Edit
                          </button>
                        )}
                        {(isAdmin || isPM) && (
                          <button onClick={() => handleDeleteTask(t.id)} className="text-xs text-rose-500 hover:text-rose-700 font-semibold px-1 py-1">✕</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      {/* MODAL 1: TASK (Create / Edit with Concurrency Lock) */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-lg text-slate-900">{taskForm.id ? "Edit Task" : "Create Task"}</h4>
              <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleTaskSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea
                  rows="2"
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                  <select
                    value={taskForm.status}
                    onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                    className="w-full text-sm border border-slate-300 rounded px-2 py-2 bg-white"
                  >
                    <option value="todo">Todo</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full text-sm border border-slate-300 rounded px-2 py-2 bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Assign To</label>
                <select
                  value={taskForm.assigned_to}
                  onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-2 bg-white"
                >
                  <option value="">Unassigned</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {taskForm.id && (
                <div className="text-xs text-indigo-600 font-mono bg-indigo-50 p-2 rounded border border-indigo-100">
                  ⚡ Concurrency Lock: v{taskForm.version}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow">Save Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: COMMENTS */}
      {showCommentsModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-3 pb-2 border-b">
              <div>
                <h4 className="font-bold text-slate-900 text-base">Task Discussion</h4>
                <p className="text-xs text-slate-500">{activeTaskComments.task?.title}</p>
              </div>
              <button onClick={() => setShowCommentsModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-2">
              {activeTaskComments.list.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">No comments on this task yet.</p>
              ) : (
                activeTaskComments.list.map((c) => (
                  <div key={c.id} className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs">
                    <div className="flex justify-between items-center text-slate-500 mb-1">
                      <span className="font-bold text-indigo-700">{c.author_name}</span>
                      <span className="text-[10px]">{c.created_at}</span>
                    </div>
                    <p className="text-slate-700">{c.content}</p>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handlePostComment} className="mt-3 pt-3 border-t flex gap-2">
              <input
                type="text"
                placeholder="Write a comment..."
                required
                value={activeTaskComments.newComment}
                onChange={(e) => setActiveTaskComments({ ...activeTaskComments, newComment: e.target.value })}
                className="flex-1 text-xs border border-slate-300 rounded px-3 py-2"
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded">Post</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PROJECT */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-lg text-slate-900">New Project</h4>
              <button onClick={() => setShowProjectModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleProjectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={projectForm.title}
                  onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea
                  rows="2"
                  value={projectForm.description}
                  onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowProjectModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: MEMBER */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-base text-slate-900">Add Team Member</h4>
              <button onClick={() => setShowMemberModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Select User</label>
                <select
                  required
                  value={memberForm.user_id}
                  onChange={(e) => setMemberForm({ ...memberForm, user_id: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded px-2 py-2 bg-white"
                >
                  <option value="">Choose a user...</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Project Role</label>
                <select
                  value={memberForm.project_role}
                  onChange={(e) => setMemberForm({ ...memberForm, project_role: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded px-2 py-2 bg-white"
                >
                  <option value="contributor">Contributor</option>
                  <option value="manager">Manager</option>
                  <option value="observer">Observer</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowMemberModal(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: USER MANAGEMENT (Admin Only) */}
      {showUsersModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <h4 className="font-bold text-lg text-slate-900">System Users (Admin Control)</h4>
              <button onClick={() => setShowUsersModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleCreateUser} className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                placeholder="Full Name"
                required
                value={newUserForm.name}
                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                className="text-xs border rounded p-2"
              />
              <input
                type="email"
                placeholder="Email"
                required
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                className="text-xs border rounded p-2"
              />
              <select
                value={newUserForm.role}
                onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                className="text-xs border rounded p-2 bg-white"
              >
                <option value="project_manager">Project Manager</option>
                <option value="team_member">Team Member</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded py-2">Create User</button>
            </form>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allUsers.map((u) => {
                    const isActive = u.is_active === 1;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="p-2 font-medium text-slate-800">{u.name}</td>
                        <td className="p-2 text-slate-500">{u.email}</td>
                        <td className="p-2 uppercase font-semibold text-[10px] text-indigo-700">{u.role.replace("_", " ")}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isActive ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                            {isActive ? "Active" : "Deactivated"}
                          </span>
                        </td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => handleToggleUserStatus(u.id, isActive ? 0 : 1)}
                            className={`text-xs font-semibold ${isActive ? "text-rose-600 hover:underline" : "text-emerald-600 hover:underline"}`}
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: LOGIN */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-lg text-slate-900">User Login</h4>
              <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  required
                  placeholder="admin@neostats.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="admin123"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full text-xs border rounded p-2"
                />
              </div>
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded shadow">
                Sign In
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}