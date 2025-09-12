'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Cpu, AlertTriangle, Package, Calendar, Settings, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import ThemeToggle from '@/components/ThemeToggle';
import SettingsDrawer, { useSettingsDrawer } from '@/components/SettingsDrawer';

export default function Home() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ title: '', description: '' });
  const { isOpen: isSettingsOpen, openSettings, closeSettings } = useSettingsDrawer();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.title || !newProject.description) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': 'test-user-id-12345'
        },
        body: JSON.stringify(newProject)
      });

      if (response.ok) {
        setShowCreateModal(false);
        setNewProject({ title: '', description: '' });
        await fetchProjects();
      } else {
        alert('Failed to create project');
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="relative bg-surface/90 backdrop-blur-sm border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-r from-accent/5 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-text">Tyton Orchestrator</h1>
              <p className="text-sm text-accent mt-1">
                Hardware project design & management with AI assistance
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* TYTON Logo */}
              <div className="text-4xl font-nasa font-bold tracking-wider text-accent">
                TYTON
              </div>
              
              {/* Theme Controls */}
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openSettings}
                  title="Open settings"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </div>

              {/* New Project Button */}
              <Button
                variant="primary"
                onClick={() => setShowCreateModal(true)}
                className="shadow-glow"
              >
                <Plus className="w-5 h-5" />
                New Project
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto p-6">
        {loading ? (
          <div className="text-center py-24">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-lg text-muted">Loading projects...</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <div className="relative mb-6">
              <Star className="w-20 h-20 text-accent/30 mx-auto" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Cpu className="w-12 h-12 text-accent" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-text mb-3">No projects yet</h2>
            <p className="text-muted mb-8 max-w-md mx-auto">
              Create your first hardware project to get started with AI-assisted design and orchestration
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowCreateModal(true)}
              className="shadow-glow"
            >
              <Plus className="w-5 h-5" />
              Create Your First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group block bg-surface border border-border rounded-xl shadow-card hover:border-accent hover:shadow-glow transition-all duration-200"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-semibold text-text group-hover:text-accent transition-colors">
                      {project.title}
                    </h3>
                    {project.status === 'safety_gate' && (
                      <div className="bg-accent/10 p-1 rounded-full">
                        <AlertTriangle className="w-4 h-4 text-accent" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted mb-6 line-clamp-3 leading-relaxed">
                    {project.description}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-accent" />
                        {project._count?.modules || 0}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-accent" />
                        {project._count?.bomItems || 0}
                      </span>
                    </div>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-accent" />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="px-6 py-3 border-t border-border bg-bg-elev rounded-b-xl">
                  <div className="flex items-center justify-between">
                    <span className={`
                      text-xs font-medium px-2 py-1 rounded-full
                      ${project.status === 'draft' ? 'bg-accent/10 text-accent' :
                        project.status === 'safety_gate' ? 'bg-yellow-500/10 text-yellow-400' :
                        project.status === 'analyzed' ? 'bg-blue-500/10 text-blue-400' :
                        project.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                        'bg-accent/10 text-accent'
                      }
                    `}>
                      {project.status?.replace('_', ' ').toUpperCase() || 'DRAFT'}
                    </span>
                    <div className="w-2 h-2 rounded-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-accent rounded-xl max-w-md w-full p-6 shadow-glow animate-in fade-in-0 zoom-in-95 duration-200">
            <h2 className="text-xl font-semibold text-text mb-4">
              Create New Project
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Project Title
                </label>
                <input
                  type="text"
                  value={newProject.title}
                  onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                  className="w-full px-4 py-2 bg-bg border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text placeholder-muted transition-colors"
                  placeholder="e.g., Smart Home Sensor Network"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Project Description
                </label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full h-32 px-4 py-2 bg-bg border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text placeholder-muted resize-none transition-colors"
                  placeholder="Describe your hardware project in detail..."
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewProject({ title: '', description: '' });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateProject}
                  className="shadow-glow"
                >
                  Create Project
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Drawer */}
      <SettingsDrawer isOpen={isSettingsOpen} onClose={closeSettings} />
    </div>
  );
}
