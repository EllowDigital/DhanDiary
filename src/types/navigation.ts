export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Auth: undefined;
  Announcement: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyEmail:
    | { email?: string; mode?: 'signup' | 'signin'; firstName?: string; lastName?: string }
    | undefined;
  ForgotPassword: { email?: string } | undefined;
  Terms: undefined;
  PrivacyPolicy: undefined;
  Eula: undefined;
  AccountDeleted: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  AddEntry: undefined;
  CashIn: undefined;
  CashOut: undefined;
  Settings: undefined;
};
