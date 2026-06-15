; Custom NSIS install steps for MenuBoard.
; Runs with admin rights during installation (perMachine), so this is the
; reliable place to open the Windows Firewall for the dashboard port (8787).

!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="MenuBoard"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="MenuBoard" dir=in action=allow protocol=TCP localport=8787'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="MenuBoard"'
!macroend
