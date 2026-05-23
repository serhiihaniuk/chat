export const submitComposerMessage = (
  message: string,
  disabled: boolean,
  onSubmit: (message: string) => void,
): boolean => {
  const trimmed = message.trim();
  if (disabled || trimmed.length === 0) return false;
  onSubmit(trimmed);
  return true;
};
