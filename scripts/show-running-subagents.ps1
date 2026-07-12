<#
.SYNOPSIS
Lists Codex native subagents that appear to be running.

.DESCRIPTION
Reads Codex rollout JSONL files from the local session directory. A subagent is
reported when its latest lifecycle event is task_started and its rollout file
was updated inside the configured activity window.

The activity window prevents abandoned legacy rollouts without a terminal event
from appearing as permanently active.

.PARAMETER SessionsRoot
Codex session directory. Defaults to $env:USERPROFILE\.codex\sessions.

.PARAMETER ActivityWindowHours
How recently a rollout must have changed to count as active. Defaults to 24.

.PARAMETER Watch
Refresh the table until Ctrl+C is pressed.

.PARAMETER RefreshSeconds
Seconds between refreshes when -Watch is used. Defaults to 3.

.EXAMPLE
.\scripts\show-running-subagents.ps1

.EXAMPLE
.\scripts\show-running-subagents.ps1 -Watch
#>
[CmdletBinding()]
param(
    [string]$SessionsRoot = (Join-Path $env:USERPROFILE '.codex\sessions'),

    [ValidateRange(0.01, 8760)]
    [double]$ActivityWindowHours = 24,

    [switch]$Watch,

    [ValidateRange(1, 3600)]
    [int]$RefreshSeconds = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$LifecycleEvents = @('task_started', 'task_complete', 'turn_aborted')

function ConvertFrom-JsonLine {
    param(
        [Parameter(Mandatory)]
        [string]$Line
    )

    try {
        return $Line | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        # A rollout can be read while Codex is still appending its final line.
        return $null
    }
}

function Get-SubagentState {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileInfo]$File
    )

    $firstLine = Get-Content -LiteralPath $File.FullName -TotalCount 1
    if (-not $firstLine) {
        return $null
    }

    $sessionRecord = ConvertFrom-JsonLine -Line $firstLine
    if (-not $sessionRecord -or $sessionRecord.type -ne 'session_meta') {
        return $null
    }

    $metadata = $sessionRecord.payload
    if ($metadata.thread_source -ne 'subagent') {
        return $null
    }

    $model = $null
    $effort = $null
    $lastLifecycleEvent = $null

    foreach ($line in Get-Content -LiteralPath $File.FullName) {
        $record = ConvertFrom-JsonLine -Line $line
        if (-not $record) {
            continue
        }

        if ($record.type -eq 'turn_context') {
            $model = $record.payload.model
            $effort = $record.payload.effort
            continue
        }

        if (
            $record.type -eq 'event_msg' -and
            $record.payload.type -in $LifecycleEvents
        ) {
            $lastLifecycleEvent = $record.payload.type
        }
    }

    if ($lastLifecycleEvent -ne 'task_started') {
        return $null
    }

    [pscustomobject]@{
        Agent        = $metadata.agent_path
        Nickname     = $metadata.agent_nickname
        Model        = $model
        Effort       = $effort
        ParentThread = $metadata.parent_thread_id
        Started      = [datetime]$metadata.timestamp
        LastActivity = $File.LastWriteTime
        Rollout      = $File.FullName
    }
}

function Get-RunningSubagents {
    if (-not (Test-Path -LiteralPath $SessionsRoot -PathType Container)) {
        throw "Codex sessions directory does not exist: $SessionsRoot"
    }

    $activityCutoff = (Get-Date).AddHours(-$ActivityWindowHours)
    $recentRollouts = Get-ChildItem -LiteralPath $SessionsRoot -Recurse -Filter '*.jsonl' -File |
        Where-Object { $_.LastWriteTime -ge $activityCutoff }

    @(
        foreach ($file in $recentRollouts) {
            Get-SubagentState -File $file
        }
    ) | Sort-Object LastActivity -Descending
}

function Show-RunningSubagents {
    $subagents = @(Get-RunningSubagents)

    if ($subagents.Count -eq 0) {
        Write-Host (
            'No running Codex subagents found ' +
            "(activity window: $ActivityWindowHours hours)."
        )
        return
    }

    $subagents | Format-Table Agent, Nickname, Model, Effort, Started, LastActivity -AutoSize
    Write-Host "`nRunning: $($subagents.Count)"
}

if ($Watch) {
    while ($true) {
        Clear-Host
        Write-Host "Codex running subagents - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"
        Show-RunningSubagents
        Start-Sleep -Seconds $RefreshSeconds
    }
}
else {
    Show-RunningSubagents
}
