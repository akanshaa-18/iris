import { PersonalizationData } from "./Personalize";

export type Instruction = FragmentInstruction | CommandInstruction;

export type FragmentInstruction = {
  type: "FragmentInstruction";
  selector: string;
  val: string;
  action: string;
  manifestId: string;
  targetManifestId: string | undefined;
};

export type CommandInstruction = {
  type: "CommandInstruction";
  action: string;
  selector: string;
  content: string;
  selectorType: string;
  manifestId: string;
  targetManifestId: string | undefined;
  modifiers?: string[];
  attribute?: string;
  completed?: boolean;
};
export const parseInstructionsFrom = async (
  personalizationData: PersonalizationData
): Promise<Instruction[]> => {
  return [] as Instruction[];
};
