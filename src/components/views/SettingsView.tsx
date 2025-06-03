'use client';

import Image from 'next/image';
import { Shield, Key, Palette, BarChart2, Building2, Mail, Phone, Image as ImageIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { supabase } from '@/lib/supabase/client';

type SettingsTab = 'access' | 'delegation' | 'branding' | 'analytics';

interface AccessControlSettings {
  allowedEmails: string[];
  restrictByDomain: boolean;
  allowedDomain: string;
}

interface DelegationSettings {
  googleServiceAccountKey: string;
  clientId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
  scopes: string[];
}

interface BrandingSettings {
  companyName: string;
  companyLogo: string;
  companyPhone: string;
  supportEmail: string;
  titleCompanyName: string;
}

interface AnalyticsSettings {
  enabled: boolean;
  trackCampaigns: boolean;
  trackUsers: boolean;
  trackPageViews: boolean;
  trackEvents: boolean;
}



const SettingsView = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('access');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [accessControl, setAccessControl] = useState<AccessControlSettings>({
    allowedEmails: [],
    restrictByDomain: false,
    allowedDomain: '',
  });
  
  const [delegation, setDelegation] = useState<DelegationSettings>({
    googleServiceAccountKey: '',
    clientId: '',
    clientEmail: '',
    privateKey: '',
    tokenUri: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
  });
  
  const [isUploading, setIsUploading] = useState(false);
  const [branding, setBranding] = useState<BrandingSettings>({
    companyName: '',
    companyLogo: '',
    companyPhone: '',
    supportEmail: '',
    titleCompanyName: '',
  });
  
  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    
    setIsUploading(true);
    setError(null);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file);
        
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);
        
      setBranding(prev => ({
        ...prev,
        companyLogo: publicUrl
      }));
      
    } catch (error) {
      console.error('Error uploading logo:', error);
      setError(
        error instanceof Error 
          ? `Failed to upload logo: ${error.message}`
          : 'Failed to upload logo. Please try again.'
      );
    } finally {
      setIsUploading(false);
    }
  };
  
  const [analytics, setAnalytics] = useState<AnalyticsSettings>({
    enabled: false,
    trackCampaigns: false,
    trackUsers: false,
    trackPageViews: false,
    trackEvents: false,
  });
  
  // Load settings function
  const loadSettings = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      // In a real implementation, you would fetch these from your database
      // const { data } = await supabase.from('settings').select('*').single();
      // if (data) {
      //   setAccessControl(data.access_control);
      //   setDelegation(data.delegation);
      //   setBranding(data.branding);
      //   setAnalytics(data.analytics);
      // }
      
    } catch (error: unknown) {
      console.error('Error loading settings:', error);
      setError(
        error instanceof Error 
          ? `Failed to load settings: ${error.message}`
          : 'Failed to load settings. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Load settings on mount
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);
  
  const saveSettings = async (section: SettingsTab) => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      
      // In a real implementation, you would save to your database
      // await supabase
      //   .from('settings')
      //   .upsert({
      //     id: 1, // or use your settings ID
      //     [section]: {
      //       ...(section === 'access' ? accessControl : {}),
      //       ...(section === 'delegation' ? delegation : {}),
      //       ...(section === 'branding' ? branding : {}),
      //       ...(section === 'analytics' ? analytics : {}),
      //     },
      //     updated_at: new Date().toISOString(),
      //   });
      
      setSuccess(`${section.charAt(0).toUpperCase() + section.slice(1)} settings saved successfully!`);
    } catch (error: unknown) {
      console.error(`Error saving ${section} settings:`, error);
      setError(
        error instanceof Error 
          ? `Failed to save ${section} settings: ${error.message}`
          : `Failed to save ${section} settings. Please try again.`
      );
    } finally {
      setIsSaving(false);
    }
  };
  
  const renderTabContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      );
    }
    
    switch (activeTab) {
      case 'access':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <Shield className="mr-2" size={24} /> Access Control
            </h2>
            
            <div className="card bg-base-200 p-6">
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-2">
                  <input 
                    type="checkbox" 
                    className="toggle toggle-primary" 
                    checked={accessControl.restrictByDomain}
                    onChange={(e) => setAccessControl({...accessControl, restrictByDomain: e.target.checked})}
                  />
                  <span className="label-text">Restrict access by domain</span>
                </label>
              </div>
              
              {accessControl.restrictByDomain && (
                <div className="form-control mt-4">
                  <label className="label">
                    <span className="label-text">Allowed Domain</span>
                  </label>
                  <input 
                    type="text" 
                    className="input input-bordered w-full" 
                    placeholder="example.com"
                    value={accessControl.allowedDomain}
                    onChange={(e) => setAccessControl({...accessControl, allowedDomain: e.target.value})}
                  />
                  <label className="label">
                    <span className="label-text-alt">Users with emails from this domain will have full access</span>
                  </label>
                </div>
              )}
              
              <div className="form-control mt-6">
                <label className="label">
                  <span className="label-text">Whitelisted Email Addresses</span>
                </label>
                <div className="space-y-2">
                  {accessControl.allowedEmails.map((email, index) => (
                    <div key={index} className="flex gap-2">
                      <input 
                        type="email" 
                        className="input input-bordered flex-1" 
                        value={email}
                        onChange={(e) => {
                          const newEmails = [...accessControl.allowedEmails];
                          newEmails[index] = e.target.value;
                          setAccessControl({...accessControl, allowedEmails: newEmails});
                        }}
                      />
                      <button 
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const newEmails = accessControl.allowedEmails.filter((_, i) => i !== index);
                          setAccessControl({...accessControl, allowedEmails: newEmails});
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button 
                    className="btn btn-ghost btn-sm mt-2"
                    onClick={() => {
                      setAccessControl({
                        ...accessControl, 
                        allowedEmails: [...accessControl.allowedEmails, '']
                      });
                    }}
                  >
                    + Add Email
                  </button>
                </div>
              </div>
              
              <div className="mt-8">
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    void saveSettings('access');
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Access Settings'}
                </button>
              </div>
            </div>
          </div>
        );
        
      case 'delegation':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <Key className="mr-2" size={24} /> Domain-Wide Delegation
            </h2>
            
            <div className="card bg-base-200 p-6">
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Google Service Account Key (JSON)</span>
                  </label>
                  <textarea 
                    className="textarea textarea-bordered h-32 font-mono text-xs" 
                    placeholder="Paste your service account JSON key"
                    value={delegation.googleServiceAccountKey}
                    onChange={(e) => setDelegation({...delegation, googleServiceAccountKey: e.target.value})}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Client ID</span>
                    </label>
                    <input 
                      type="text" 
                      className="input input-bordered w-full" 
                      value={delegation.clientId}
                      onChange={(e) => setDelegation({...delegation, clientId: e.target.value})}
                    />
                  </div>
                  
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Client Email</span>
                    </label>
                    <input 
                      type="email" 
                      className="input input-bordered w-full" 
                      value={delegation.clientEmail}
                      onChange={(e) => setDelegation({...delegation, clientEmail: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Private Key</span>
                  </label>
                  <textarea 
                    className="textarea textarea-bordered h-32 font-mono text-xs" 
                    placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
                    value={delegation.privateKey}
                    onChange={(e) => setDelegation({...delegation, privateKey: e.target.value})}
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Token URI</span>
                  </label>
                  <input 
                    type="text" 
                    className="input input-bordered w-full" 
                    value={delegation.tokenUri}
                    onChange={(e) => setDelegation({...delegation, tokenUri: e.target.value})}
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">OAuth Scopes</span>
                  </label>
                  <div className="space-y-2">
                    {delegation.scopes.map((scope, index) => (
                      <div key={index} className="flex gap-2">
                        <input 
                          type="text" 
                          className="input input-bordered flex-1 font-mono text-xs" 
                          value={scope}
                          onChange={(e) => {
                            const newScopes = [...delegation.scopes];
                            newScopes[index] = e.target.value;
                            setDelegation({...delegation, scopes: newScopes});
                          }}
                        />
                        <button 
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            const newScopes = delegation.scopes.filter((_, i) => i !== index);
                            setDelegation({...delegation, scopes: newScopes});
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button 
                      className="btn btn-ghost btn-sm mt-2"
                      onClick={() => {
                        setDelegation({
                          ...delegation, 
                          scopes: [...delegation.scopes, '']
                        });
                      }}
                    >
                      + Add Scope
                    </button>
                  </div>
                </div>
                
                <div className="mt-6">
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      void saveSettings('delegation');
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Delegation Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 'branding':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <Building2 className="mr-2" size={24} /> Branding
            </h2>
            
            <div className="card bg-base-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Company Name</span>
                  </label>
                  <input 
                    type="text" 
                    className="input input-bordered w-full" 
                    value={branding.companyName}
                    onChange={(e) => setBranding({...branding, companyName: e.target.value})}
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Title Company Name</span>
                  </label>
                  <input 
                    type="text" 
                    className="input input-bordered w-full" 
                    value={branding.titleCompanyName}
                    onChange={(e) => setBranding({...branding, titleCompanyName: e.target.value})}
                    placeholder="e.g., John Doe"
                  />
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Support Email</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Mail className="w-5 h-5 text-gray-500" />
                    </div>
                    <input 
                      type="email" 
                      className="input input-bordered w-full pl-10" 
                      value={branding.supportEmail}
                      onChange={(e) => setBranding({...branding, supportEmail: e.target.value})}
                      placeholder="support@example.com"
                    />
                  </div>
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Company Phone</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Phone className="w-5 h-5 text-gray-500" />
                    </div>
                    <input 
                      type="tel" 
                      className="input input-bordered w-full pl-10" 
                      value={branding.companyPhone}
                      onChange={(e) => setBranding({...branding, companyPhone: e.target.value})}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
                
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Company Logo</span>
                  </label>
                  <div className="flex items-center space-x-4">
                    <div className="avatar">
                      <div className="w-16 h-16 rounded-lg bg-base-300 flex items-center justify-center">
                        {branding.companyLogo ? (
                          <Image 
                            src={branding.companyLogo} 
                            alt="Company Logo" 
                            width={128}
                            height={128}
                            className="object-contain p-1" // Adjusted className
                            // onError is not directly supported like in <img>.
                            // Fallback strategies can be implemented with custom loaders or by handling broken images upstream.
                            // For now, removing onError as per task focus.
                          />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                    </div>
                    <div>
                      <input 
                        type="file" 
                        className="file-input file-input-bordered w-full max-w-xs"
                        accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleLogoUpload(file);
                          }
                        }}
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        {isUploading ? 'Uploading...' : 'PNG, JPG, or SVG. Max 2MB. Recommended size: 200x50px'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-8">
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    void saveSettings('branding');
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Branding Settings'}
                </button>
              </div>
            </div>
          </div>
        );
        
      case 'analytics':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <BarChart2 className="mr-2" size={24} /> Analytics & Reporting
            </h2>
            
            <div className="card bg-base-200 p-6">
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-2">
                  <input 
                    type="checkbox" 
                    className="toggle toggle-primary" 
                    checked={analytics.enabled}
                    onChange={(e) => setAnalytics({...analytics, enabled: e.target.checked})}
                  />
                  <span className="label-text font-medium">Enable Analytics</span>
                </label>
                <label className="label">
                  <span className="label-text-alt">Track and analyze user interactions within the application</span>
                </label>
              </div>
              
              <div className="mt-6 space-y-4">
                <h3 className="font-medium">Track the following metrics:</h3>
                
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-2">
                    <input 
                      type="checkbox" 
                      className="checkbox checkbox-primary" 
                      checked={analytics.trackCampaigns}
                      onChange={(e) => setAnalytics({...analytics, trackCampaigns: e.target.checked})}
                      disabled={!analytics.enabled}
                    />
                    <span className="label-text">Campaign Performance</span>
                  </label>
                  <label className="label ml-6">
                    <span className="label-text-alt">Open rates, click-through rates, conversions</span>
                  </label>
                </div>
                
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-2">
                    <input 
                      type="checkbox" 
                      className="checkbox checkbox-primary" 
                      checked={analytics.trackUsers}
                      onChange={(e) => setAnalytics({...analytics, trackUsers: e.target.checked})}
                      disabled={!analytics.enabled}
                    />
                    <span className="label-text">User Activity</span>
                  </label>
                  <label className="label ml-6">
                    <span className="label-text-alt">Active users, session duration, feature usage</span>
                  </label>
                </div>
                
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-2">
                    <input 
                      type="checkbox" 
                      className="checkbox checkbox-primary" 
                      checked={analytics.trackPageViews}
                      onChange={(e) => setAnalytics({...analytics, trackPageViews: e.target.checked})}
                      disabled={!analytics.enabled}
                    />
                    <span className="label-text">Page Views</span>
                  </label>
                  <label className="label ml-6">
                    <span className="label-text-alt">Most visited pages, navigation paths</span>
                  </label>
                </div>
                
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-2">
                    <input 
                      type="checkbox" 
                      className="checkbox checkbox-primary" 
                      checked={analytics.trackEvents}
                      onChange={(e) => setAnalytics({...analytics, trackEvents: e.target.checked})}
                      disabled={!analytics.enabled}
                    />
                    <span className="label-text">Custom Events</span>
                  </label>
                  <label className="label ml-6">
                    <span className="label-text-alt">Button clicks, form submissions, downloads</span>
                  </label>
                </div>
              </div>
              
              <div className="mt-8">
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    void saveSettings('analytics');
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Analytics Settings'}
                </button>
              </div>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="card bg-base-200 p-4">
            <ul className="menu bg-base-200 rounded-box">
              <li>
                <button 
                  className={`flex items-center ${activeTab === 'access' ? 'active' : ''}`}
                  onClick={() => setActiveTab('access')}
                >
                  <Shield className="w-5 h-5" />
                  <span>Access Control</span>
                </button>
              </li>
              <li>
                <button 
                  className={`flex items-center ${activeTab === 'delegation' ? 'active' : ''}`}
                  onClick={() => setActiveTab('delegation')}
                >
                  <Key className="w-5 h-5" />
                  <span>Domain Delegation</span>
                </button>
              </li>
              <li>
                <button 
                  className={`flex items-center ${activeTab === 'branding' ? 'active' : ''}`}
                  onClick={() => setActiveTab('branding')}
                >
                  <Building2 className="w-5 h-5" />
                  <span>Branding</span>
                </button>
              </li>
              <li>
                <button 
                  className={`flex items-center ${activeTab === 'analytics' ? 'active' : ''}`}
                  onClick={() => setActiveTab('analytics')}
                >
                  <BarChart2 className="w-5 h-5" />
                  <span>Analytics</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1">
          {error && (
            <div className="alert alert-error mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
          
          {success && (
            <div className="alert alert-success mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{success}</span>
            </div>
          )}
          
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
