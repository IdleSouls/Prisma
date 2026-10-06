# Dare Prisma a un amico (o a uno studio) — nuovo flusso

All'amico si manda **un solo file: `Installa-Prisma.exe`**. Niente cartelle, niente zip pieni di file.

## Una volta (e a ogni nuova versione): costruire l'installer

1. Doppio clic su `electron-app\Costruisci-Installer.bat` (serve Node.js; la prima volta scarica Electron: qualche minuto).
2. Il file nasce in `electron-app\dist-setup\Installa-Prisma.exe` (circa 200 MB: meglio un link OneDrive/Drive che la mail).
3. Windows può mostrare "PC protetto" perché il file non è firmato: *Ulteriori informazioni → Esegui comunque*. Diglielo prima.

Dentro l'installer ci sono solo app, librerie e chiave **pubblica**. Non c'è nessun dato tuo, nessuna password, nessuna chiave privata.

## Cosa fa l'amico

1. Doppio clic su `Installa-Prisma.exe`: si installa da solo, crea il collegamento sul Desktop e nel menu Start e apre Prisma.
2. Prisma si apre su una schermata **"Attiva Prisma"** con il suo **codice macchina** e un tasto *Copia*. Te lo manda.
3. Quando gli arriva `license.json` lo trascina nella schermata (o *Scegli il file…*). Prisma si attiva e parte la versione completa. Nessuna cartella da cercare.

I suoi dati stanno in `C:\Users\<nome>\Prisma` (non da toccare); gli aggiornamenti dell'installer non li cancellano.

## Tu: emettere la licenza

Doppio clic su `licensing\Genera-Licenza.bat` → inserisci nome studio, codice macchina, scadenza (facoltativa).
La licenza finisce in `licensing\emesse\<studio>\license.json` (mandagli solo quello) e viene aggiunta a `licensing\Licenze-emesse.xlsx`.

## Da sapere

- Se cambia PC serve una nuova licenza (nuovo codice macchina). Il codice dipende anche dal nome del computer.
- `chiave-privata.pem` è il tuo segreto: mai nell'installer, sempre in backup a parte.
- Aggiornamenti automatici da GitHub: funzionano solo se il repository è pubblico.
- Se l'installer non parte o Prisma non si apre, i log sono in `C:\Users\<nome>\Prisma\logs\prisma.log`.
- `Prisma.mcpb` (per usare Claude con Prisma) viene copiato in `C:\Users\<nome>\Prisma`: si installa con doppio clic in Claude Desktop.
