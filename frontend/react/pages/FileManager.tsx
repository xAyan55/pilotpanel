import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Folder, File, ArrowLeft, Upload, Plus, Archive, Trash2, Edit3, ArrowUpRight, Copy, Scissors, Download, FileText, CheckCircle2 } from 'lucide-react';

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
  const [dragActive, setDragActive] = useState(false);

  // Editor State
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  // Editor Search & Replace State
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchResultsCount, setSearchResultsCount] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Item Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isNewDir, setIsNewDir] = useState(false);

  // Compress Modal State
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [compressTarget, setCompressTarget] = useState<string | null>(null);
  const [archiveName, setArchiveName] = useState('');
  const [archiveFormat, setArchiveFormat] = useState('.zip');

  // Copy / Move Modal State
  const [showCopyMoveModal, setShowCopyMoveModal] = useState(false);
  const [copyMoveTarget, setCopyMoveTarget] = useState<string | null>(null);
  const [copyMoveDest, setCopyMoveDest] = useState('');
  const [isMoveAction, setIsMoveAction] = useState(false);

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
        // Sort: directories first, then alphabetical
        const sorted = data.sort((a: FileItem, b: FileItem) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        setFiles(sorted);
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
        setIsDirty(false);
      } else {
        alert('Could not read file.');
      }
    } catch {
      alert('Error loading file content.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFile = async (silent = false) => {
    if (!editingFile) return;
    if (!silent) setSaving(true);
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
        setIsDirty(false);
        if (!silent) {
          setEditingFile(null);
          fetchFiles();
        }
      } else if (!silent) {
        alert('Failed to save file.');
      }
    } catch {
      if (!silent) alert('Error saving file.');
    } finally {
      if (!silent) setSaving(false);
    }
  };

  // Editor Auto-save Timer
  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || !editingFile) return;
    
    const timer = setTimeout(() => {
      handleSaveFile(true);
    }, 5000); // Auto-save after 5 seconds of inactivity

    return () => clearTimeout(timer);
  }, [fileContent, autoSaveEnabled, isDirty, editingFile]);

  // Search & Replace logic inside Editor
  const handleFind = () => {
    if (!findText) {
      setSearchResultsCount(null);
      return;
    }
    const regex = new RegExp(findText, 'gi');
    const matches = fileContent.match(regex);
    setSearchResultsCount(matches ? matches.length : 0);
  };

  const handleReplace = () => {
    if (!findText) return;
    setFileContent((prev) => {
      const index = prev.toLowerCase().indexOf(findText.toLowerCase());
      if (index === -1) return prev;
      const next = prev.substring(0, index) + replaceText + prev.substring(index + findText.length);
      setIsDirty(true);
      return next;
    });
  };

  const handleReplaceAll = () => {
    if (!findText) return;
    const regex = new RegExp(findText, 'gi');
    setFileContent((prev) => {
      const next = prev.replace(regex, replaceText);
      setIsDirty(true);
      return next;
    });
    setSearchResultsCount(0);
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

  // Compression ZIP/TAR/TGZ trigger
  const handleCompressTrigger = (itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompressTarget(itemName);
    setArchiveName(`${itemName}`);
    setArchiveFormat('.zip');
    setShowCompressModal(true);
  };

  const handleCompress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compressTarget) return;

    const targetPath = currentPath ? `${currentPath}/${compressTarget}` : compressTarget;
    const fullArchiveName = currentPath
      ? `${currentPath}/${archiveName}${archiveFormat}`
      : `${archiveName}${archiveFormat}`;

    try {
      const res = await fetch(`/api/servers/${uuid}/files/zip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ path: targetPath, archiveName: fullArchiveName })
      });

      if (res.ok) {
        setShowCompressModal(false);
        fetchFiles();
      } else {
        alert('Archiving failed.');
      }
    } catch {
      alert('Compression failed.');
    }
  };

  // Archive Extraction trigger
  const handleExtract = async (itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetPath = currentPath ? `${currentPath}/${itemName}` : itemName;
    const destFolder = currentPath; // Extract to current folder by default

    try {
      const res = await fetch(`/api/servers/${uuid}/files/unzip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ archivePath: targetPath, extractFolder: destFolder })
      });

      if (res.ok) {
        fetchFiles();
      } else {
        alert('Extraction failed.');
      }
    } catch {
      alert('Archive extraction failed.');
    }
  };

  // Copy or Move Action Triggers
  const handleCopyMoveTrigger = (itemName: string, isMove: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setCopyMoveTarget(itemName);
    setCopyMoveDest(currentPath ? `${currentPath}/${itemName}_copy` : `${itemName}_copy`);
    setIsMoveAction(isMove);
    setShowCopyMoveModal(true);
  };

  const handleCopyMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copyMoveTarget) return;

    const sourcePath = currentPath ? `${currentPath}/${copyMoveTarget}` : copyMoveTarget;
    const endpoint = isMoveAction ? 'rename' : 'copy';

    try {
      const res = await fetch(`/api/servers/${uuid}/files/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPath: sourcePath, newPath: copyMoveDest })
      });

      if (res.ok) {
        setShowCopyMoveModal(false);
        fetchFiles();
      } else {
        alert(`${isMoveAction ? 'Move' : 'Copy'} operation failed.`);
      }
    } catch {
      alert('File manager operation error.');
    }
  };

  // File Download trigger via direct auth link
  const handleDownload = (itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filePath = currentPath ? `${currentPath}/${itemName}` : itemName;
    window.open(`/api/servers/${uuid}/files/download?path=${encodeURIComponent(filePath)}&token=${token}`, '_blank');
  };

  // File Upload Handlers (Button upload & Drag and Drop)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    await uploadFileList(fileList);
  };

  const uploadFileList = async (fileList: FileList) => {
    setLoading(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const uploadPath = currentPath ? `${currentPath}/${file.name}` : file.name;

        await fetch(`/api/servers/${uuid}/files/upload?path=${encodeURIComponent(uploadPath)}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/octet-stream'
          },
          body: file // Upload raw file stream directly
        });
      }
      fetchFiles();
    } catch {
      alert('File upload failed.');
    } finally {
      setLoading(false);
    }
  };

  // Drag and Drop Hooks
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFileList(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      style={{ minHeight: '80vh', position: 'relative' }}
    >
      {dragActive && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(146, 154, 171, 0.2)',
          border: '3px dashed var(--accent)',
          borderRadius: 'var(--radius-lg)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <Upload size={48} color="var(--text-primary)" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Drop files here to upload</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Uploading directly to /{currentPath}</p>
          </div>
        </div>
      )}

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

          {/* Upload Button */}
          <label className="btn btn-secondary" style={{ margin: 0, cursor: 'pointer' }}>
            <Upload size={16} /> Upload File
            <input type="file" multiple style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>

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
        <div className="card" style={{ padding: '2rem' }}>
          {/* File Editor Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Editing: {editingFile}</h3>
              {isDirty && <span style={{ fontSize: '0.8rem', color: 'var(--color-warning)', fontWeight: 600 }}>● Unsaved Changes</span>}
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoSaveEnabled}
                  onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                />
                Auto-save (5s)
              </label>

              <button className="btn btn-secondary" onClick={() => {
                if (isDirty && !window.confirm('You have unsaved changes. Discard?')) return;
                setEditingFile(null);
              }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleSaveFile(false)} disabled={saving}>{saving ? 'Saving...' : 'Save & Close'}</button>
            </div>
          </div>

          {/* Find & Replace Floating Panel */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            background: 'var(--bg-secondary)',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <input
              type="text"
              placeholder="Find text..."
              className="form-control"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', margin: 0, width: '200px' }}
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
            />
            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={handleFind}>Find</button>
            
            {searchResultsCount !== null && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {searchResultsCount} matches
              </span>
            )}

            <input
              type="text"
              placeholder="Replace with..."
              className="form-control"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', margin: 0, width: '200px', marginLeft: 'auto' }}
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
            />
            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={handleReplace}>Replace</button>
            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={handleReplaceAll}>Replace All</button>
          </div>

          {/* Code Textarea */}
          <textarea
            ref={textareaRef}
            style={{
              width: '100%',
              height: '480px',
              backgroundColor: '#1E2022',
              color: '#F7F7F7',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.9rem',
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none'
            }}
            value={fileContent}
            onChange={(e) => {
              setFileContent(e.target.value);
              setIsDirty(true);
            }}
          />
        </div>
      ) : loading ? (
        <div className="skeleton" style={{ height: '400px' }}></div>
      ) : (
        <div className="card table-container">
          {files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#929AAB' }}>
              <Folder size={48} style={{ marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>This directory is empty.</h3>
              <p style={{ fontSize: '0.85rem' }}>Drag and drop files here to upload.</p>
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
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                        
                        {/* Download button for files */}
                        {!file.isDirectory && (
                          <button className="btn btn-secondary" style={{ padding: '0.35rem' }} onClick={(e) => handleDownload(file.name, e)} title="Download file">
                            <Download size={14} />
                          </button>
                        )}

                        {/* Copy / Move actions */}
                        <button className="btn btn-secondary" style={{ padding: '0.35rem' }} onClick={(e) => handleCopyMoveTrigger(file.name, false, e)} title="Copy file">
                          <Copy size={14} />
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.35rem' }} onClick={(e) => handleCopyMoveTrigger(file.name, true, e)} title="Move file">
                          <Scissors size={14} />
                        </button>

                        {/* Archive options */}
                        {file.name.endsWith('.zip') || file.name.endsWith('.tar') || file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz') ? (
                          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }} onClick={(e) => handleExtract(file.name, e)} title="Extract Archive">
                            Extract
                          </button>
                        ) : (
                          <button className="btn btn-secondary" style={{ padding: '0.35rem' }} onClick={(e) => handleCompressTrigger(file.name, e)} title="Archive File/Folder">
                            <Archive size={14} />
                          </button>
                        )}
                        <button className="btn btn-secondary" style={{ padding: '0.35rem' }} onClick={(e) => handleDelete(file.name, e)} title="Delete">
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

      {/* Creation Modal */}
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

      {/* Compression Configuration Modal */}
      {showCompressModal && (
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
              Compress File/Folder
            </h3>
            <form onSubmit={handleCompress}>
              <div className="form-group">
                <label className="form-label">Archive Filename</label>
                <input
                  type="text"
                  className="form-control"
                  value={archiveName}
                  onChange={(e) => setArchiveName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Archive Format</label>
                <select className="form-control" value={archiveFormat} onChange={(e) => setArchiveFormat(e.target.value)}>
                  <option value=".zip">ZIP Archive (.zip)</option>
                  <option value=".tar">TAR Tape Archive (.tar)</option>
                  <option value=".tar.gz">TAR Gzipped Archive (.tar.gz)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCompressModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Compress</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy / Move Modal */}
      {showCopyMoveModal && (
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
          <div className="card" style={{ width: '100%', maxWidth: '450px', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem' }}>
              {isMoveAction ? 'Move' : 'Copy'} File/Folder
            </h3>
            <form onSubmit={handleCopyMove}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Source: <strong>{copyMoveTarget}</strong>
              </div>
              <div className="form-group">
                <label className="form-label">Destination Path (relative to root)</label>
                <input
                  type="text"
                  className="form-control"
                  value={copyMoveDest}
                  onChange={(e) => setCopyMoveDest(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCopyMoveModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{isMoveAction ? 'Move' : 'Copy'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;
