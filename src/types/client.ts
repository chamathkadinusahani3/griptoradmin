import { ClientStatus, PlanName } from '../data/superAdminData';
import { Branding } from '../context/AuthContext';

export interface Client {
  id: string;
  name: string;
  contact: string;
  email: string;
  plan: PlanName;
  status: ClientStatus;
  modules: string[];
  addOns: string[];
  disabledCoreFeatures: string[];
  signupDate: string;
  mrr: number;
  locations: number;
  staff: number;
  branding: Branding;
  slug?: string;
  hasSmsConfig: boolean;
  smsSenderId?: string;
}
