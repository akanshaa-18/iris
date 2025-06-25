import { PersonalizationData } from "./Personalize";

export type Instruction = {
  fragments: Array<{
    selector: string;
    val: string;
    action: string;
    manifestId: string;
    targetManifestId: string | undefined;
  }>;
  commands: Array<{
    action: string;
    selector: string;
    content: string;
    selectorType: string;
    manifestId: string;
    targetManifestId: string | undefined;
  }>;
};

export const parseInstructionsFrom = async (
  personalizationData: PersonalizationData
): Promise<Instruction[]> => {
  return [] as Instruction[];
};
