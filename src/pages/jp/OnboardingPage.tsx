import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Camera, Target, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase, STORAGE_PHOTO_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { TagInput } from '@/components/ui';
import type { ResumeContent } from '@/types/db';

const STEPS = ['resume', 'photo', 'target', 'done'] as const;
type Step = (typeof STEPS)[number];

function emptyResumeContent(name: string): ResumeContent {
  return {
    basics: { name, email: '', phone: '', location: '', headline: '', links: [{ label: 'LinkedIn', url: '' }] },
    summary: '',
    experience: [{ company: '', title: '', location: '', start: '', end: '', current: false, bullets: [''] }],
    education: [{ school: '', degree: '', field: '', start: '', end: '' }],
    skills: [],
    projects: [],
    certifications: [],
  };
}

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>('resume');
  const [resumeMode, setResumeMode] = useState<'upload' | 'build' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile?.photo_url ?? null);
  const [currentRole, setCurrentRole] = useState(profile?.current_job_title ?? '');
  const [targetRole, setTargetRole] = useState(profile?.target_role ?? '');
  const [industry, setIndustry] = useState(profile?.target_industry ?? '');
  const [locations, setLocations] = useState<string[]>(profile?.target_locations ?? []);
  const [dealbreakers, setDealbreakers] = useState<string[]>(profile?.dealbreakers ?? []);

  const saveStep = async (stepName: string) => {
    await supabase.from('jp_profiles').update({ onboarding_step: stepName }).eq('id', profile!.id);
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.show('File must be under 5 MB.', 'error');
      return;
    }
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) {
      toast.show('Only PDF or DOCX files are allowed.', 'error');
      return;
    }
    setUploading(true);
    const path = `${user!.id}/${file.name}`;
    const { error: upErr } = await supabase.storage
      .from('jp-resumes')
      .upload(path, file, { upsert: true });
    if (upErr) {
      setUploading(false);
      toast.show('Upload failed. Try again.', 'error');
      return;
    }
    const { data: urlData } = supabase.storage.from('jp-resumes').getPublicUrl(path);
    const { data: resume } = await supabase
      .from('jp_resumes')
      .insert({
        user_id: user!.id,
        name: file.name.replace(/\.(pdf|docx)$/i, ''),
        template: 'modern',
        is_primary: true,
        source: 'upload',
        original_file_url: urlData.publicUrl,
        content: emptyResumeContent(profile?.full_name || ''),
        parse_status: 'pending',
      })
      .select()
      .single();
    setUploading(false);
    if (!resume) {
      toast.show('Could not save resume record.', 'error');
      return;
    }
    await api.parseResume(resume.id);
    toast.show('Resume uploaded! You can edit it in the Resume Builder.', 'success');
    setStep('photo');
  };

  const handlePhoto = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      toast.show('Photo must be under 3 MB.', 'error');
      return;
    }
    const path = `${user!.id}/${file.name}`;
    const { error } = await supabase.storage.from('jp-photos').upload(path, file, { upsert: true });
    if (error) {
      toast.show('Photo upload failed.', 'error');
      return;
    }
    const { data: urlData } = supabase.storage.from('jp-photos').getPublicUrl(path);
    setPhotoUrl(urlData.publicUrl);
    await supabase.from('jp_profiles').update({ photo_url: urlData.publicUrl }).eq('id', profile!.id);
  };

  const finishOnboarding = async () => {
    await supabase
      .from('jp_profiles')
      .update({
        onboarding_complete: true,
        onboarding_step: 'done',
        current_job_title: currentRole,
        target_role: targetRole,
        target_industry: industry || null,
        target_locations: locations,
        dealbreakers: dealbreakers,
      })
      .eq('id', profile!.id);
    await refreshProfile();
    toast.show('Onboarding complete! Welcome to JobPilot.', 'success');
    navigate('/dashboard', { replace: true });
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="jp-onboarding">
      <div className="jp-onboarding-card">
        <div className="jp-onboarding-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`jp-onboarding-step ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}>
              <span className="jp-onboarding-step-dot">
                {i < stepIndex ? <Check size={14} /> : i + 1}
              </span>
              <span className="jp-onboarding-step-label">{s}</span>
            </div>
          ))}
        </div>

        {step === 'resume' && (
          <div className="jp-onboarding-content">
            <h2>Add your resume</h2>
            <p>Upload an existing resume or build one from scratch.</p>
            {!resumeMode ? (
              <div className="jp-choice-grid">
                <button className="jp-choice-card" onClick={() => setResumeMode('upload')}>
                  <Upload size={28} />
                  <h3>Upload my resume</h3>
                  <p>PDF or DOCX up to 5 MB. We'll parse it automatically.</p>
                </button>
                <button
                  className="jp-choice-card"
                  onClick={() => {
                    setResumeMode('build');
                    navigate('/resume-builder');
                  }}
                >
                  <FileText size={28} />
                  <h3>Build with guided form</h3>
                  <p>Use our editor to create a polished resume step by step.</p>
                </button>
              </div>
            ) : resumeMode === 'upload' ? (
              <div className="jp-upload-zone">
                <label className="jp-upload-dropzone">
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    disabled={uploading}
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                  />
                  <Upload size={32} />
                  <p>{uploading ? 'Uploading…' : 'Click to select a PDF or DOCX file'}</p>
                </label>
                <button className="jp-btn-ghost" onClick={() => setResumeMode(null)}>
                  <ArrowLeft size={16} /> Back
                </button>
              </div>
            ) : null}
            {resumeMode === 'upload' && (
              <button className="jp-btn-ghost jp-onboarding-skip" onClick={() => setStep('photo')}>
                Skip for now <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}

        {step === 'photo' && (
          <div className="jp-onboarding-content">
            <h2>Add a profile photo</h2>
            <p>A professional photo makes your outreach more effective.</p>
            <div className="jp-photo-section">
              <div className="jp-photo-preview">
                {photoUrl ? <img src={photoUrl} alt="Profile" /> : <Camera size={40} />}
              </div>
              <label className="jp-btn-primary jp-photo-upload-btn">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
                />
                Upload photo
              </label>
            </div>
            <div className="jp-onboarding-nav">
              <button className="jp-btn-ghost" onClick={() => setStep('resume')}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="jp-btn-primary" onClick={() => { saveStep('photo'); setStep('target'); }}>
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 'target' && (
          <div className="jp-onboarding-content">
            <h2>What role are you targeting?</h2>
            <p>We'll use this to find matching jobs and tailor your outreach.</p>
            <div className="jp-form-grid">
              <label>
                <span>Current role</span>
                <input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} placeholder="e.g. Software Engineer" />
              </label>
              <label>
                <span>Target role</span>
                <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Senior Software Engineer" />
              </label>
              <label>
                <span>Industry (optional)</span>
                <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Fintech" />
              </label>
              <label>
                <span>Preferred locations</span>
                <TagInput values={locations} onChange={setLocations} placeholder="e.g. Remote, New York" />
              </label>
              <label>
                <span>Dealbreakers</span>
                <TagInput values={dealbreakers} onChange={setDealbreakers} placeholder="e.g. no agencies, no relocation" />
              </label>
            </div>
            <div className="jp-onboarding-nav">
              <button className="jp-btn-ghost" onClick={() => setStep('photo')}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="jp-btn-primary" onClick={() => { saveStep('target'); setStep('done'); }}>
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="jp-onboarding-content jp-onboarding-done">
            <div className="jp-onboarding-done-icon"><Check size={40} /></div>
            <h2>You're all set!</h2>
            <p>JobPilot is ready to start finding jobs and sending outreach for you.</p>
            <button className="jp-btn-primary jp-btn-large" onClick={finishOnboarding}>
              Go to dashboard <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
