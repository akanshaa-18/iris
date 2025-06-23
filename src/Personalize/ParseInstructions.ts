import { PersonalizationData } from "./Personalize";

export type Instructions = unknown[];

export const parseInstructionsFrom = async (
  personalizationData: PersonalizationData
): Promise<Instructions[]> => {
  throw new Error("Not Yet Implemented");
};
