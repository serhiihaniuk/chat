export const HOST_CAPABILITY_VALIDATION_CODES = {
  UNKNOWN_SCHEMA_VERSION: "unknown_schema_version",
  DUPLICATE_PROFILE_ID: "duplicate_profile_id",
  DUPLICATE_TOOL_NAME: "duplicate_tool_name",
  DUPLICATE_COMMAND_NAME: "duplicate_command_name",
  DUPLICATE_APPROVAL_POLICY_ID: "duplicate_approval_policy_id",
  MISSING_DEFAULT_PROFILE: "missing_default_profile",
  UNKNOWN_PROFILE_REFERENCE: "unknown_profile_reference",
  PROFILE_EXECUTOR_POLICY_MISMATCH: "profile_executor_policy_mismatch",
  UNKNOWN_TOOL_REFERENCE: "unknown_tool_reference",
  UNKNOWN_COMMAND_REFERENCE: "unknown_command_reference",
  UNKNOWN_APPROVAL_REFERENCE: "unknown_approval_reference",
  PROFILE_VERSION_MISMATCH: "profile_version_mismatch",
  PROFILE_INSTRUCTIONS_POLICY_MISMATCH: "profile_instructions_policy_mismatch",
  PROFILE_MODEL_POLICY_MISMATCH: "profile_model_policy_mismatch",
  APPROVAL_POLICY_MISMATCH: "approval_policy_mismatch",
} as const;

export type HostCapabilityValidationCode =
  (typeof HOST_CAPABILITY_VALIDATION_CODES)[keyof typeof HOST_CAPABILITY_VALIDATION_CODES];
