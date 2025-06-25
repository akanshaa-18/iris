import { AuthState } from "../Auth/Auth";

export type PersonalizationData = {
  requestId: string;
  handle: Array<{
    payload: any[];
    type: string;
    [key: string]: any;
  }>;
};

export const getPersonalizationData = async (
  request: EW.ResponseProviderRequest, 
  authState: AuthState
): Promise<PersonalizationData> => {
  return {} as PersonalizationData;
};
