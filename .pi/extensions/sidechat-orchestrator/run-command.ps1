param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
    [string[]] $Command
)

# Pi's direct process runner cannot execute Windows .cmd shims. Keep the
# PowerShell program fixed and forward every remaining process argument as data.
$executable = $Command[0]
$executableArguments = if ($Command.Count -gt 1) { $Command[1..($Command.Count - 1)] } else { @() }
& $executable @executableArguments
exit $LASTEXITCODE
