' Avvia Prisma senza mostrare la finestra nera del terminale (la console).
' Usa "Prisma.exe" se esiste (dopo aver eseguito licensing\Costruisci-Eseguibili.bat);
' altrimenti torna al vecchio metodo con "Avvia Gestionale.bat" (richiede Node.js).
' In entrambi i casi il browser si apre da solo sull'app, come gia' succede oggi.
'
' Per fermare Prisma: apri Gestione attivita' di Windows (Task Manager) e chiudi
' il processo "Prisma.exe" o "node.exe" - dato che non c'e' una finestra da chiudere.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
cartella = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = cartella

If fso.FileExists(cartella & "\Prisma.exe") Then
  shell.Run """" & cartella & "\Prisma.exe""", 0, False
Else
  shell.Run "cmd /c """"" & cartella & "\Avvia Gestionale.bat""""", 0, False
End If
