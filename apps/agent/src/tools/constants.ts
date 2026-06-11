export const GIT_CONTEXT_TOOL = {
  ID: "git-context",
  DESCRIPTION:
    "Read a source file in the OpsAgent repository and list its most recent git commits. Use this to associate an incident with the code that was last changed.",
  DEFAULT_COMMIT_LIMIT: 5,
  COMMIT_LIMIT_MIN: 1,
  COMMIT_LIMIT_MAX: 20,
  MAX_CONTENT_BYTES: 256 * 1024,
  ERROR: {
    PATH_OUT_OF_REPO: "PATH_OUT_OF_REPO",
    FILE_NOT_FOUND: "FILE_NOT_FOUND",
    CONTENT_TRUNCATED: "CONTENT_TRUNCATED",
    READ_FAILED: "READ_FAILED",
    GIT_FAILED: "GIT_FAILED",
  },
} as const;

export type GitContextErrorCode =
  (typeof GIT_CONTEXT_TOOL.ERROR)[keyof typeof GIT_CONTEXT_TOOL.ERROR];
