import type { ProjectTrackingLookupResponse } from "@/types/project-tracking";

export type ClientPortalProjectSummary = {
  id: string;
  currentTrackingLeadId: string | null;
  clientPortalUserId: string | null;
  clientName: string | null;
  companyName: string | null;
  displayName: string | null;
  flowType: "company_opening" | "existing_company";
  flowLabel: string;
  status: "active" | "completed" | "paused";
  statusLabel: string;
  updatedAt: string;
  trackingCode: string;
};

export type ClientPortalIdentity = {
  id: string;
  fullName: string;
  email: string | null;
};

export type ClientPortalOverviewResponse = {
  ok: true;
  client: ClientPortalIdentity;
  projects: ClientPortalProjectSummary[];
  referralsCount: number;
  claimRequired: boolean;
  claimDocumentValidationMode?: "disabled" | "optional" | "required";
};

export type ClientPortalProjectResponse = {
  ok: true;
  client: ClientPortalIdentity;
  projects: ClientPortalProjectSummary[];
  activeProjectId: string | null;
  tracking: ProjectTrackingLookupResponse | null;
  claimRequired: boolean;
  claimDocumentValidationMode?: "disabled" | "optional" | "required";
};

export type ClientPortalReferralStage = {
  key: string;
  label: string;
  description: string;
  isTerminal: boolean;
  isWon: boolean;
  isLost: boolean;
};

export type ClientPortalReferralTimelineStep = {
  key: string;
  label: string;
  description: string;
  status: "complete" | "current" | "upcoming";
};

export type ClientPortalReferralReward = {
  title: string;
  description: string;
  tone: "neutral" | "positive" | "muted";
};

export type ClientPortalReferralItem = {
  id: string;
  trackingToken: string;
  createdAt: string;
  updatedAt: string;
  referredCompanyOrPerson: string;
  referredContactName: string | null;
  currentStage: ClientPortalReferralStage;
  timeline: ClientPortalReferralTimelineStep[];
  reward: ClientPortalReferralReward;
};

export type ClientPortalReferralListResponse = {
  ok: true;
  client: ClientPortalIdentity;
  projects: ClientPortalProjectSummary[];
  activeProjectId: string | null;
  referrals: ClientPortalReferralItem[];
  claimRequired: boolean;
  claimDocumentValidationMode?: "disabled" | "optional" | "required";
};

export type ClientPortalReferralSubmitResponse = {
  ok: true;
  duplicate?: boolean;
  lead_id: string;
  tracking_token: string;
  referred_company_or_person: string;
  referred_contact_name: string;
};

export type ClientPortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  access_status: string | null;
  is_active: boolean;
};

export type ClientPortalLinkResponse = {
  project_id: string | null;
  client_user: ClientPortalUser | null;
};

export type ClientPortalClaimAccessResponse = {
  ok: true;
  claimedCount: number;
  claimRequired: boolean;
  projects: ClientPortalProjectSummary[];
};

export type ClientPortalInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type ClientPortalInvitationProject = {
  id: string;
  currentTrackingLeadId?: string | null;
  clientPortalUserId?: string | null;
  clientName?: string | null;
  companyName?: string | null;
  displayName: string;
  flowType?: "company_opening" | "existing_company";
  flowLabel: string;
  statusLabel: string;
  trackingCode: string;
  updatedAt: string;
  linkedClientUser?: ClientPortalUser | null;
};

export type ClientPortalInvitationSummary = {
  id: string;
  status: ClientPortalInvitationStatus;
  email: string;
  fullName: string | null;
  documentNumber: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  lastSentAt: string | null;
  projectIds: string[];
  projects: ClientPortalInvitationProject[];
  acceptedByUser: ClientPortalUser | null;
};

export type ClientPortalInvitationSetupResponse = {
  lead: {
    id: string;
    full_name: string | null;
    email: string | null;
    document_number: string | null;
  };
  projects: ClientPortalInvitationProject[];
  invitation: ClientPortalInvitationSummary | null;
};

export type ClientPortalInvitationUpsertResponse = {
  ok: true;
  invitation: ClientPortalInvitationSummary | null;
  activation_path: string;
  message: string;
};

export type ClientPortalInvitationProjectLookupResponse = {
  ok: true;
  project: ClientPortalInvitationProject;
};

export type ClientPortalInvitationProjectSearchResponse = {
  ok: true;
  projects: ClientPortalInvitationProject[];
};

export type ClientPortalInvitationContextResponse = {
  ok: true;
  invitation: {
    id: string;
    status: ClientPortalInvitationStatus;
    email: string;
    fullName: string | null;
    documentNumber: string | null;
    expiresAt: string;
    acceptedAt: string | null;
    projectCount: number;
    projects: ClientPortalInvitationProject[];
  };
};

export type ClientPortalInvitationAcceptResponse = {
  ok: true;
  redirectPath: string;
  projectsLinked: number;
  client: {
    id: string;
    email: string | null;
    fullName: string;
  };
};
