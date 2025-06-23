import { PersonalizationData } from "./Personalize";

export type Instruction = unknown;

export const parseInstructionsFrom = async (
  personalizationData: PersonalizationData
): Promise<Instruction[]> => {
  return [] as Instruction[];
};
