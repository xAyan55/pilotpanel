import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Folder, File, ArrowLeft, Upload, Plus, Archive, Trash2, Edit3, ArrowUpRight } from 'lucide-react';

interface FileItem {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

const FileManager: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor State
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Creation State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isNewDir, setIsNewDir] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, [uuid, currentPath, token]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${uuid}/files?path=${encodeURIComponent(currentPath)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch {
      console.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (dirName: string) => {
    const nextPath = currentPath ? `${currentPath}/${dirName}` : dirName;
    setCurrentPath(nextPath);
  };

  const handleBackClick = () => {
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const handleOpenFile = async (filePath: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${uuid}/files/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ path: currentPath ? `${currentPath}/${filePath}` : filePath })
      });

      if (res.ok) {
        const data = await res.json();
        setEditingFile(filePath);
        setFileContent(data.content);
      } else {
        alert('Could not read file.');
      }
    } catch {
      alert('Error loading file content.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${uuid}/files/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          path: currentPath ? `${currentPath}/${editingFile}` : editingFile,
          content: fileContent
        })
      });

      if (res.ok) {
        setEditingFile(null);
        fetchFiles();
      } else {
        alert('Failed to save file.');
      }
    } catch {
      alert('Error saving file.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete ${itemName}?`)) return;

    try {
      const res = await fetch(`/api/servers/${uuid}/files`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ path: currentPath ? `${currentPath}/${itemName}` : itemName })
      });

      if (res.ok) {
        fetchFiles();
      }
    } catch {
      alert('Failed to delete.');
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const targetPath = currentPath ? `${currentPath}/${newItemName}` : newItemName;

    try {
      const res = await fetch(`/api/servers/${uuid}/files/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          path: targetPath,
          content: isNewDir ? '' : '# New File Created by PilotPanel'
        })
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewItemName('');
        fetchFiles();
      }
    } catch {
      alert('Failed to create item.');
    }
  };

  const handleZipItem = async (itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetPath = currentPath ? `${currentPath}/${itemName}` : itemName;
    const archiveName = `${itemName}.zip`;

    try {
      const res = await fetch(`/api/servers/${uuid}/files/zip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ path: targetPath, archiveName })
      });
      if (res.ok) {
        fetchFiles();
      } else {
        alert('Zip creation failed.');
      }
    } catch {
      alert('Error during zip compression.');
    }
  };

  const handleUnzipItem = async (itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetPath = currentPath ? `${currentPath}/${itemName}` : itemName;

    try {
      const res = await fetch(`/api/servers/${uuid}/files/unzip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ archivePath: targetPath })
      });
      if (res.ok) {
        fetchFiles();
      } else {
        alert('Extraction failed.');
      }
    } catch {
      alert('Error during zip extraction.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">File Manager</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/servers/${uuid}`)}>Console</span>
            <ArrowUpRight size={14} />
            <span>/{currentPath}</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {currentPath && (
            <button className="btn btn-secondary" onClick={handleBackClick}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => {
            setIsNewDir(false);
            setShowCreateModal(true);
          }}>
            <Plus size={16} /> Create File
          </button>
          <button className="btn btn-primary" onClick={() => {
            setIsNewDir(true);
            setShowCreateModal(true);
          }}>
            <Folder size={16} /> Create Folder
          </button>
        </div>
      </div>

      {editingFile ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Editing: {editingFile}</h3>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setEditingFile(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveFile} disabled={saving}>{saving ? 'Saving...' : 'Save File'}</button>
            </div>
          </div>
          <textarea
            style={{
              width: '100%',
              height: '450px',
              backgroundColor: '#1E2022',
              color: '#F7F7F7',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: '12px',
              padding: '1.25rem',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.9rem',
              lineHeight: 1.6,
              resize: 'vertical'
            }}
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
          />
        </div>
      ) : loading ? (
        <div className="skeleton" style={{ height: '300px' }}></div>
      ) : (
        <div className="card table-container">
          {files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#929AAB' }}>
              <Folder size={36} style={{ marginBottom: '0.5rem' }} />
              <p>This directory is empty.</p>
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Last Modified</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.name} style={{ cursor: file.isDirectory ? 'pointer' : 'default' }} onClick={() => file.isDirectory ? handleFolderClick(file.name) : handleOpenFile(file.name)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {file.isDirectory ? <Folder size={18} color="#929AAB" /> : <File size={18} color="#393E46" />}
                        <span style={{ fontWeight: file.isDirectory ? 600 : 400 }}>{file.name}</span>
                      </div>
                    </td>
                    <td>{file.isDirectory ? '-' : `${(file.size / 1024).toFixed(1)} KB`}</td>
                    <td style={{ fontSize: '0.85rem', color: '#929AAB' }}>
                      {new Date(file.modified).toLocaleDateString()} {new Date(file.modified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {file.name.endsWith('.zip') ? (
                          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={(e) => handleUnzipItem(file.name, e)}>
                            Extract
                          </button>
                        ) : (
                          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={(e) => handleZipItem(file.name, e)}>
                            <Archive size={14} />
                          </button>
                        )}
                        <button className="btn btn-secondary" style={{ padding: '0.3rem' }} onClick={(e) => handleDelete(file.name, e)}>
                          <Trash2 size={14} color="#D9534F" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem' }}>
              Create {isNewDir ? 'Directory' : 'File'}
            </h3>
            <form onSubmit={handleCreateItem}>
              <div className="form-group">
                <label className="form-label">{isNewDir ? 'Folder Name' : 'File Name (with extension)'}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={isNewDir ? 'plugins' : 'server.properties'}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;
