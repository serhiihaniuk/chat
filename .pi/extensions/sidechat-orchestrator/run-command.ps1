param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $EncodedCommand
)

# Pi's direct process runner cannot execute Windows .cmd shims, and PowerShell's
# parameter binder consumes tokens like `--` from plain arguments. A base64 JSON
# payload keeps every argument byte-exact.
$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($EncodedCommand))
# ConvertFrom-Json emits the parsed array as one un-enumerated pipeline object;
# wrapping it in @() would nest it, so assign the result directly.
$commandLine = ConvertFrom-Json -InputObject $json
$executable = $commandLine[0]
$executableArguments = if ($commandLine.Count -gt 1) { $commandLine[1..($commandLine.Count - 1)] } else { @() }
& $executable @executableArguments
exit $LASTEXITCODE
