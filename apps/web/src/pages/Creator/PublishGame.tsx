import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import { toast } from '../../components/toastEvents';
import { api, ApiClientError } from '../../lib/api';
import { IS_DEMO } from '../../lib/appMode';
import { versionStatusLabel } from '../../lib/versionStatus';
import {
  FileCode,
  UploadCloud,
  Monitor,
  Smartphone,
  Tablet,
  CheckCircle,
  Sparkles,
  Check,
  AlertTriangle,
} from 'lucide-react';

/** Turn upload/publish errors into a clear, actionable message for the creator. */
function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'NETWORK_ERROR') return 'Upload endpoint is unreachable. Please try again.';
    if (error.status === 413) return 'Upload failed: the ZIP exceeds the size limit.';
    if (error.status === 401 || error.status === 403)
      return 'Upload failed: your session expired. Please sign in again and retry.';
    if (error.status === 409) return error.message || 'This build was already submitted.';
    return error.message || 'Upload failed. Please try again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Upload failed. Please try again.';
}

export const PublishGame: React.FC = () => {
  const { currentUser } = useAuth();
  const { createGame, submitForReview } = useGames();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Persisted across retries so a failed upload does NOT spawn duplicate
  // game/version/upload-intent records — we reuse the existing draft instead.
  const draftRef = useRef<{ gameId?: string; versionId?: string; uploadId?: string }>({});

  // --- Step 1: Basic Info ---
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Action');
  const [shortDesc, setShortDesc] = useState('');
  const [fullDesc, setFullDesc] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // --- Step 2: Game Build ---
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipFileName, setZipFileName] = useState('');
  const [zipFileSize, setZipFileSize] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLog, setUploadLog] = useState<string[]>([]);
  const [isUploaded, setIsUploaded] = useState(false);

  // --- Step 3: Media ---
  const [coverUrl, setCoverUrl] = useState(
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600',
  );
  const [screenshotUrl, setScreenshotUrl] = useState(
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800',
  );

  // --- Step 4: Compatibility ---
  const [deviceDesktop, setDeviceDesktop] = useState(true);
  const [deviceMobile, setDeviceMobile] = useState(false);
  const [deviceTablet, setDeviceTablet] = useState(false);
  const [multiplayer, setMultiplayer] = useState(false);
  const [controlKeys, setControlKeys] = useState('W/A/S/D or Arrow keys to steer');
  const [controlAction, setControlAction] = useState('Left click or Space to shoot');

  // --- Step 5: AI Disclosure ---
  const [aiDisclosure, setAiDisclosure] = useState<'no' | 'assisted' | 'generated'>('no');
  const [aiTools, setAiTools] = useState<string[]>([]);

  // Simulation upload build
  const handleZipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      toast.danger('Invalid file format. Please upload a ZIP archive.');
      return;
    }

    setZipFile(file);
    setZipFileName(file.name);
    setZipFileSize(`${(file.size / (1024 * 1024)).toFixed(1)} MB`);
    setUploadProgress(0);
    setUploadLog([]);
    setIsUploaded(false);

    if (!IS_DEMO) {
      setUploadLog(['ZIP selected. It will upload to quarantine when you submit the game.']);
      setIsUploaded(true);
      return;
    }

    // Demo-only progress simulation.
    let prog = 0;
    const interval = setInterval(() => {
      prog += 20;
      setUploadProgress(prog);

      if (prog === 20) {
        setUploadLog((prev) => [...prev, 'Reading the ZIP in this browser-only demo...']);
      } else if (prog === 60) {
        setUploadLog((prev) => [
          ...prev,
          'No server or malware scanner is connected in demo mode.',
        ]);
      } else if (prog === 80) {
        setUploadLog((prev) => [...prev, 'Demo mode stores game metadata only in this browser.']);
      } else if (prog === 100) {
        setUploadLog((prev) => [
          ...prev,
          'Demo upload complete. No real validation or malware scan was performed.',
        ]);
        setIsUploaded(true);
        clearInterval(interval);
      }
    }, 4000 / 5);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!title.trim() || !shortDesc.trim() || !fullDesc.trim()) {
        toast.warning('Please fill out all required basic information.');
        return;
      }
    }
    if (step === 2) {
      if (!isUploaded) {
        toast.warning(
          IS_DEMO
            ? 'Please select a game ZIP and wait for the demo progress to finish.'
            : 'Please select the game build ZIP that will be uploaded on submission.',
        );
        return;
      }
    }

    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setStep((prev) => prev - 1);
  };

  const handleAiCheck = (tool: string) => {
    if (aiTools.includes(tool)) {
      setAiTools(aiTools.filter((t) => t !== tool));
    } else {
      setAiTools([...aiTools, tool]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (loading) return; // guard against double-submit while a request is in flight
    if (!zipFile) {
      toast.warning('Select a ZIP build first.');
      return;
    }

    setLoading(true);

    const tags = tagsInput
      ? tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : ['HTML5', 'Canvas', 'WebGL'];

    const devices: string[] = [];
    if (deviceDesktop) devices.push('desktop', 'keyboard', 'mouse');
    if (deviceMobile) devices.push('mobile', 'touch');
    if (deviceTablet) devices.push('tablet', 'touch');

    const controls = [controlKeys, controlAction].filter((c) => c.length > 0);

    try {
      // 1. Create the game draft once. On a retry after a failed upload we reuse
      //    the id we already have instead of creating a duplicate game.
      let gameId = draftRef.current.gameId;
      if (!gameId) {
        const newGame = await createGame(
          {
            title,
            shortDescription: shortDesc,
            fullDescription: fullDesc,
            category,
            tags,
            coverUrl,
            screenshots: [screenshotUrl],
            devices,
            controls,
            multiplayer,
            aiDisclosure,
            aiTools,
            version: '1.0.0',
            changelog: [
              {
                version: '1.0.0',
                date: new Date().toISOString().split('T')[0],
                notes: 'Initial public launch build submitted.',
              },
            ],
            fileSize: zipFileSize || '5.4 MB',
            fileName: zipFileName || 'game-archive.zip',
          },
          currentUser.id,
          currentUser.displayName,
          currentUser.avatar,
        );
        gameId = newGame.id;
        draftRef.current.gameId = gameId;
      }

      if (IS_DEMO) {
        submitForReview(gameId);
      } else {
        // 2. Create the version record once (reused on retry).
        let versionId = draftRef.current.versionId;
        if (!versionId) {
          const version = await api.createVersion(gameId, {
            version: '1.0.0',
            changelog: 'Initial private beta build.',
            aiDisclosure:
              aiDisclosure === 'no'
                ? 'NONE'
                : aiDisclosure === 'assisted'
                  ? 'ASSISTED'
                  : 'GENERATED',
            toolsUsed: aiTools,
          });
          versionId = version.id;
          draftRef.current.versionId = versionId;
        }
        setUploadProgress(20);
        setUploadLog(['Game draft created.', 'Version record created.']);

        // 3. Create the upload intent once (reused on retry). We only hash the
        //    ZIP when we actually need a fresh intent.
        let uploadId = draftRef.current.uploadId;
        if (!uploadId) {
          const bytes = await zipFile.arrayBuffer();
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const sha256 = [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
          const intent = await api.createUploadIntent(gameId, {
            versionId,
            fileName: zipFile.name,
            fileSize: zipFile.size,
            contentType: 'application/zip',
            sha256,
          });
          uploadId = intent.uploadId;
          draftRef.current.uploadId = uploadId;
        }

        setUploadProgress(45);
        setUploadLog((lines) => [...lines, 'Uploading ZIP to quarantine storage...']);
        // 4. Upload through the SAME-ORIGIN API (never directly to MinIO). The
        //    API stores the bytes internally, marks the upload complete, and
        //    enqueues the validation worker — all in this one request.
        const status = await api.uploadZipDirect(uploadId, zipFile);
        setUploadProgress(100);
        setUploadLog((lines) => [
          ...lines,
          `Status: ${versionStatusLabel(status.versionStatus)}. Validation continues asynchronously.`,
        ]);
      }

      // Success — clear the draft so a future publish starts fresh.
      draftRef.current = {};
      setLoading(false);
      setSuccess(true);
      toast.success(
        IS_DEMO
          ? 'Demo submission stored in this browser.'
          : 'Build uploaded to quarantine and queued for validation.',
      );
    } catch (error) {
      // Keep draftRef populated so the next click retries the SAME draft
      // (re-uploading) instead of creating duplicate games/versions.
      setLoading(false);
      toast.danger(uploadErrorMessage(error));
    }
  };

  if (success) {
    return (
      <div style={successWrapperStyle} className="bg-glass animate-slide-up">
        <div style={successIconBoxStyle}>
          <CheckCircle size={40} color="var(--success)" />
        </div>
        <h1>Submission Received!</h1>
        <p style={successDescStyle}>
          {IS_DEMO
            ? 'This demo submission is stored only in this browser. No backend scan or moderation was performed.'
            : 'Your game build was uploaded to quarantine and queued for structural validation and malware scanning.'}
        </p>
        <p style={{ ...successDescStyle, color: 'var(--text-secondary)' }}>
          {IS_DEMO
            ? 'Use the demo role switch to explore the rest of the prototype.'
            : 'The creator dashboard will show the real validation result before the build can enter moderation.'}
        </p>
        <div style={successActionsStyle}>
          <button onClick={() => navigate('/creator/my-games')} className="btn btn-secondary">
            Manage Builds
          </button>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      {/* Wizard Step Tracker Header */}
      <div style={stepsTrackerStyle} className="bg-glass">
        {[1, 2, 3, 4, 5, 6].map((num) => (
          <div key={num} style={stepIndicatorContainerStyle}>
            <div
              style={{
                ...stepIndicatorCircleStyle,
                backgroundColor:
                  step === num
                    ? 'var(--secondary)'
                    : step > num
                      ? 'var(--primary)'
                      : 'var(--bg-hover)',
                color: step >= num ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {step > num ? <Check size={14} /> : num}
            </div>
            <span
              style={{
                ...stepIndicatorLabelStyle,
                color: step === num ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {num === 1 && 'Info'}
              {num === 2 && 'Build'}
              {num === 3 && 'Media'}
              {num === 4 && 'Input'}
              {num === 5 && 'AI'}
              {num === 6 && 'Review'}
            </span>
            {num < 6 && <div style={stepIndicatorLineStyle}></div>}
          </div>
        ))}
      </div>

      {/* Forms Area */}
      <div style={formCardStyle} className="bg-glass">
        {/* STEP 1: Basic Info */}
        {step === 1 && (
          <div className="animate-fade">
            <h2 style={stepTitleStyle}>Step 1 — Basic Game Information</h2>
            <p style={stepDescStyle}>
              Provide a catchy title and clear descriptions to attract players.
            </p>

            <div className="form-group">
              <label className="form-label">Game Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Synthwave Drift"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="form-input form-select"
              >
                {[
                  'Action',
                  'Adventure',
                  'Arcade',
                  'Casual',
                  'Platformer',
                  'RPG',
                  'Shooter',
                  'Racing',
                  'Puzzle',
                  'Simulator',
                  'Sports',
                  'Strategy',
                ].map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Short Description (Max 120 chars) *</label>
              <input
                type="text"
                required
                maxLength={120}
                placeholder="A brief punchy hook that displays on cards..."
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                className="form-input"
              />
              <span style={helperTextStyle}>{shortDesc.length}/120 characters</span>
            </div>

            <div className="form-group">
              <label className="form-label">Full Description *</label>
              <textarea
                required
                placeholder="Describe your gameplay mechanics, goals, features, and engine specifications..."
                value={fullDesc}
                onChange={(e) => setFullDesc(e.target.value)}
                className="form-input"
                style={{ minHeight: '120px', resize: 'vertical' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tags (separated by comma)</label>
              <input
                type="text"
                placeholder="three.js, canvas, physics, synthwave, retro"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        )}

        {/* STEP 2: Game Build Upload */}
        {step === 2 && (
          <div className="animate-fade">
            <h2 style={stepTitleStyle}>Step 2 — Upload Game Archive</h2>
            <p style={stepDescStyle}>
              {IS_DEMO
                ? 'Select a `.zip` archive to demonstrate the publishing flow. The demo does not upload or scan it.'
                : 'Select a `.zip` archive containing index.html. On submission it is uploaded to quarantine, validated by the worker, and only approved builds can run on the isolated game origin.'}{' '}
              Server-side code is not supported.
            </p>

            <div style={uploadContainerStyle}>
              <UploadCloud size={48} color="var(--text-secondary)" style={{ opacity: 0.6 }} />
              <div style={{ margin: '1rem 0' }}>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  <span>Select Game ZIP</span>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleZipFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Maximum file size limit: 100MB. Make sure `index.html` is located at the archive root
                folder.
              </span>
            </div>

            {zipFileName && (
              <div style={fileDetailsBoxStyle} className="bg-glass">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileCode size={18} color="var(--secondary)" />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{zipFileName}</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {zipFileSize}
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: '6px',
                    width: '100%',
                    backgroundColor: 'var(--bg-hover)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    marginBottom: '1rem',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${uploadProgress}%`,
                      backgroundColor:
                        uploadProgress === 100 ? 'var(--success)' : 'var(--secondary)',
                      transition: 'width 0.3s ease',
                    }}
                  ></div>
                </div>

                {/* Scanners logs console */}
                <div style={consoleLogStyle}>
                  {uploadLog.map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        color:
                          log.includes('passed') || log.includes('complete')
                            ? 'var(--success)'
                            : 'var(--text-secondary)',
                      }}
                    >
                      &gt; {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Media */}
        {step === 3 && (
          <div className="animate-fade">
            <h2 style={stepTitleStyle}>Step 3 — Media & Covers</h2>
            <p style={stepDescStyle}>Upload eye-catching cover graphics and screenshot layouts.</p>

            <div className="form-group">
              <label className="form-label">Cover Image URL</label>
              <input
                type="text"
                placeholder="https://images.unsplash.com/photo-..."
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                className="form-input"
              />
              <span style={helperTextStyle}>
                Enter an Unsplash or absolute image link (aspect ratio 16:10).
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Screenshot 1 URL</label>
              <input
                type="text"
                placeholder="https://images.unsplash.com/photo-..."
                value={screenshotUrl}
                onChange={(e) => setScreenshotUrl(e.target.value)}
                className="form-input"
              />
              <span style={helperTextStyle}>Enter an absolute image link (aspect ratio 16:9).</span>
            </div>

            <div style={previewBoxStyle} className="bg-glass">
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                }}
              >
                Cover Preview:
              </div>
              <img
                src={coverUrl}
                alt="Cover Preview"
                style={previewImgStyle}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600';
                }}
              />
            </div>
          </div>
        )}

        {/* STEP 4: Compatibility */}
        {step === 4 && (
          <div className="animate-fade">
            <h2 style={stepTitleStyle}>Step 4 — Compatibility & Inputs</h2>
            <p style={stepDescStyle}>
              Specify which systems and input controls are required for gameplay.
            </p>

            <div style={flexGroupStyle}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Devices Compatibility
                </label>
                <div style={checkboxStackStyle}>
                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      checked={deviceDesktop}
                      onChange={(e) => setDeviceDesktop(e.target.checked)}
                      className="checkbox-input"
                    />
                    <span style={{ fontSize: '0.9rem' }}>
                      <Monitor size={14} style={{ marginRight: '6px' }} /> Desktop support
                    </span>
                  </label>

                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      checked={deviceMobile}
                      onChange={(e) => setDeviceMobile(e.target.checked)}
                      className="checkbox-input"
                    />
                    <span style={{ fontSize: '0.9rem' }}>
                      <Smartphone size={14} style={{ marginRight: '6px' }} /> Mobile support
                    </span>
                  </label>

                  <label className="checkbox-group">
                    <input
                      type="checkbox"
                      checked={deviceTablet}
                      onChange={(e) => setDeviceTablet(e.target.checked)}
                      className="checkbox-input"
                    />
                    <span style={{ fontSize: '0.9rem' }}>
                      <Tablet size={14} style={{ marginRight: '6px' }} /> Tablet support
                    </span>
                  </label>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Keyboard/Steering Controls</label>
                  <input
                    type="text"
                    value={controlKeys}
                    onChange={(e) => setControlKeys(e.target.value)}
                    placeholder="e.g. W/A/S/D to move"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Action / Clicks Controls</label>
                  <input
                    type="text"
                    value={controlAction}
                    onChange={(e) => setControlAction(e.target.value)}
                    placeholder="e.g. Left click to fire"
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--border-color)',
                margin: '1.5rem 0',
              }}
            />

            <div className="form-group">
              <label className="checkbox-group">
                <input
                  type="checkbox"
                  checked={multiplayer}
                  onChange={(e) => setMultiplayer(e.target.checked)}
                  className="checkbox-input"
                />
                <span style={{ fontSize: '0.9rem' }}>
                  This game includes multiplayer features implemented by the game. VibePlay does not
                  provide a multiplayer server.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* STEP 5: AI Disclosure */}
        {step === 5 && (
          <div className="animate-fade">
            <h2 style={stepTitleStyle}>Step 5 — AI-Assisted Disclosures</h2>
            <p style={stepDescStyle}>
              Honest disclosure helps players discover and understand your development tools.
            </p>

            <div className="form-group">
              <label className="form-label">Was AI used to create this game? *</label>
              <div style={radioRowStyle}>
                <label
                  style={{
                    ...radioItemStyle,
                    borderColor: aiDisclosure === 'no' ? 'var(--primary)' : 'var(--border-color)',
                    backgroundColor: aiDisclosure === 'no' ? 'var(--primary-soft)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="aiDisclosure"
                    checked={aiDisclosure === 'no'}
                    onChange={() => setAiDisclosure('no')}
                    style={{ marginRight: '8px' }}
                  />
                  <div>
                    <strong>No AI tools used</strong>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        marginTop: '2px',
                      }}
                    >
                      Built entirely by human programming.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    ...radioItemStyle,
                    borderColor:
                      aiDisclosure === 'assisted' ? 'var(--primary)' : 'var(--border-color)',
                    backgroundColor:
                      aiDisclosure === 'assisted' ? 'var(--primary-soft)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="aiDisclosure"
                    checked={aiDisclosure === 'assisted'}
                    onChange={() => setAiDisclosure('assisted')}
                    style={{ marginRight: '8px' }}
                  />
                  <div>
                    <strong>AI-Assisted</strong>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        marginTop: '2px',
                      }}
                    >
                      Generative AI helped draft scripts, debug, or design templates.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    ...radioItemStyle,
                    borderColor:
                      aiDisclosure === 'generated' ? 'var(--primary)' : 'var(--border-color)',
                    backgroundColor:
                      aiDisclosure === 'generated' ? 'var(--primary-soft)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="aiDisclosure"
                    checked={aiDisclosure === 'generated'}
                    onChange={() => setAiDisclosure('generated')}
                    style={{ marginRight: '8px' }}
                  />
                  <div>
                    <strong>Mostly AI-Generated</strong>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        marginTop: '2px',
                      }}
                    >
                      Core coding logic and textures were generated from prompts.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {aiDisclosure !== 'no' && (
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label className="form-label">Specify the tools used:</label>
                <div style={aiToolsGridStyle}>
                  {[
                    'Claude',
                    'Gemini',
                    'GPT-4 / ChatGPT',
                    'Cursor',
                    'Midjourney',
                    'v0',
                    'Suno',
                  ].map((tool) => (
                    <label key={tool} className="checkbox-group" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={aiTools.includes(tool)}
                        onChange={() => handleAiCheck(tool)}
                        className="checkbox-input"
                      />
                      <span style={{ fontSize: '0.85rem' }}>{tool}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 6: Review & Submit */}
        {step === 6 && (
          <div className="animate-fade">
            <h2 style={stepTitleStyle}>Step 6 — Review Submission</h2>
            <p style={stepDescStyle}>
              Review all details before committing build to the moderation queue.
            </p>

            <div style={reviewGridStyle} className="bg-glass">
              <div style={reviewCoverWrapperStyle}>
                <img src={coverUrl} alt="" style={reviewCoverStyle} />
              </div>

              <div style={reviewDetailsStyle}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{title}</h3>
                <span className="badge badge-success" style={{ alignSelf: 'flex-start' }}>
                  {category}
                </span>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  {shortDesc}
                </p>

                <hr
                  style={{
                    border: 'none',
                    borderTop: '1px solid var(--border-color)',
                    margin: '12px 0',
                  }}
                />

                <div style={reviewMetaRowStyle}>
                  <div>
                    <strong>Build Name:</strong> {zipFileName} ({zipFileSize})
                  </div>
                  <div>
                    <strong>AI Status:</strong>{' '}
                    {aiDisclosure === 'no'
                      ? 'Human-made'
                      : `AI ${aiDisclosure} (${aiTools.join(', ')})`}
                  </div>
                  <div>
                    <strong>Compatibilities:</strong> {deviceDesktop ? 'Desktop ' : ''}
                    {deviceMobile ? 'Mobile ' : ''}
                    {deviceTablet ? 'Tablet ' : ''}
                  </div>
                  <div>
                    <strong>Multiplayer:</strong> {multiplayer ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
            </div>

            <div style={noticeBoxStyle}>
              <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {IS_DEMO
                  ? 'This demo stores metadata in your browser and does not perform moderation.'
                  : 'Submission creates an administrator-visible validation report and locks executable publication until a moderator approves the build.'}
              </span>
            </div>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div style={wizardFooterStyle}>
          {step > 1 && (
            <button onClick={handleBack} className="btn btn-secondary">
              Back
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => navigate('/creator')}
              className="btn btn-secondary btn-sm"
              style={{ border: 'none' }}
            >
              Cancel
            </button>
            {step < 6 ? (
              <button onClick={handleNext} className="btn btn-primary">
                Next Step
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="btn btn-primary"
                style={{ gap: '6px' }}
              >
                <Sparkles size={16} />
                <span>{loading ? 'Submitting build...' : 'Submit for Review'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Styles
const successWrapperStyle: React.CSSProperties = {
  maxWidth: '600px',
  margin: '2rem auto',
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  padding: '3rem',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '1.25rem',
};

const successIconBoxStyle: React.CSSProperties = {
  width: '72px',
  height: '72px',
  borderRadius: '50%',
  backgroundColor: 'var(--success-soft)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const successDescStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  lineHeight: 1.6,
};

const successActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '1rem',
};

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
  maxWidth: '750px',
  width: '100%',
  margin: '0 auto',
};

const stepsTrackerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '1rem 1.5rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  flexWrap: 'wrap',
  gap: '1rem',
};

const stepIndicatorContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  position: 'relative',
};

const stepIndicatorCircleStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.75rem',
  fontWeight: 700,
};

const stepIndicatorLabelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
};

const stepIndicatorLineStyle: React.CSSProperties = {
  width: '20px',
  height: '1px',
  backgroundColor: 'var(--border-color)',
};

const formCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  padding: '2.5rem',
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  marginBottom: '0.25rem',
};

const stepDescStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginBottom: '2rem',
  lineHeight: 1.5,
};

const helperTextStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginTop: '4px',
  textAlign: 'right',
};

const uploadContainerStyle: React.CSSProperties = {
  border: '2px dashed var(--border-color)',
  borderRadius: '12px',
  padding: '3rem 2rem',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  backgroundColor: 'rgba(255,255,255,0.01)',
};

const fileDetailsBoxStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  padding: '1.25rem',
  borderRadius: '10px',
  border: '1px solid var(--border-color)',
};

const consoleLogStyle: React.CSSProperties = {
  backgroundColor: '#05070D',
  borderRadius: '6px',
  padding: '12px',
  fontFamily: 'Courier, monospace',
  fontSize: '0.75rem',
  maxHeight: '120px',
  overflowY: 'auto',
  lineHeight: 1.5,
};

const previewBoxStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
};

const previewImgStyle: React.CSSProperties = {
  width: '180px',
  height: '110px',
  objectFit: 'cover',
  borderRadius: '4px',
  border: '1px solid var(--border-color)',
};

const flexGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2rem',
  flexWrap: 'wrap',
};

const checkboxStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  marginTop: '8px',
};

const radioRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginTop: '8px',
};

const radioItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const aiToolsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: '12px',
  marginTop: '8px',
};

const reviewGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  padding: '1.5rem',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  flexWrap: 'wrap',
};

const reviewCoverWrapperStyle: React.CSSProperties = {
  flex: '1 1 180px',
  maxWidth: '240px',
};

const reviewCoverStyle: React.CSSProperties = {
  width: '100%',
  height: '140px',
  objectFit: 'cover',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
};

const reviewDetailsStyle: React.CSSProperties = {
  flex: '2 1 300px',
  display: 'flex',
  flexDirection: 'column',
};

const reviewMetaRowStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const noticeBoxStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid var(--primary-border)',
  backgroundColor: 'var(--warning-soft)',
  marginTop: '1.5rem',
};

const wizardFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginTop: '2rem',
  paddingTop: '1.5rem',
  borderTop: '1px solid var(--border-color)',
};
