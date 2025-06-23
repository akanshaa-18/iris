import { AuthState } from "../Auth/Auth";

export type PersonalizationData = unknown;

export const getPersonalizationData = async (
  request: EW.ResponseProviderRequest, 
  authState: AuthState
): Promise<PersonalizationData> => {
  return {} as PersonalizationData;
};
