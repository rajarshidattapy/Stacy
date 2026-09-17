export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubAuthState {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  accessToken: string | null;
}

export interface GitHubPushRequest {
  repositoryId?: number;
  repositoryName?: string;
  branch: string;
  commitMessage: string;
  files: Record<string, string>; // path -> content
  createRepository?: {
    name: string;
    description?: string;
    private: boolean;
  };
}

export interface GitHubPushResponse {
  success: boolean;
  commitHash?: string;
  repositoryUrl?: string;
  error?: string;
}

export interface GitHubConnectedRepo {
  id: number;
  name: string;
  full_name: string;
  branch: string;
  html_url: string;
}