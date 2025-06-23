export type AuthState = LoggedIn | LoggedOut;

type LoggedIn = unknown;
type LoggedOut = unknown;

type Result<T> = T | "Nothing";

export const authenticate = async (
  aux_sid: string | "NOT_FOUND"
): Promise<AuthState> => {
  if (aux_sid === "NOT_FOUND") return {} as LoggedOut;
  const token = await getToken(aux_sid, clientSecret());
  if (token === "Nothing") return {} as LoggedOut;
  const profile = await getProfile(token);
  if (profile === "Nothing") return {} as LoggedOut;
  return parseAuthState(profile);
};

type Token = unknown;

const getToken = async (
  aux_sid: string,
  client_secret: string
): Promise<Result<Token>> => {
  return "Nothing";
}

const clientSecret = (): string => {
  throw new Error("Not yet Implemented");
}

type Profile = unknown;

const getProfile = async (
  token: Token
): Promise<Result<Profile>> => {
  return "Nothing";
};

const parseAuthState = (
  profile: Profile
): LoggedIn => {
  throw new Error("Not Yet Implemented");
};
