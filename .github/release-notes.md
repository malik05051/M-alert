Alertes météo en temps réel par département, avec la carte de vigilance Météo-France.

## Installation

### Windows 10 / 11
- **`M-Alert-Setup-….exe`** : installateur (recommandé).
- **`M-Alert-Portable-….exe`** : version sans installation.

L'application n'est pas signée numériquement : au premier lancement, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur ». Cliquez sur **Informations complémentaires** puis **Exécuter quand même**.

### Arch Linux
M-Alert est dans le dépôt pacman [malik05](https://github.com/malik05051/malik05-repo) (ajout du dépôt décrit dans son README), puis :

```console
# pacman -Syu m-alert
```

### Autres distributions Linux
- **`M-Alert-….AppImage`** : toutes distributions. `chmod +x M-Alert-*.AppImage` puis lancez-le.
- **`M-Alert-…-amd64.deb`** : Debian, Ubuntu, Linux Mint… `sudo apt install ./M-Alert-*-amd64.deb`

## Premier lancement
Choisissez votre département : vous entendrez une alerte sonore et recevrez une notification dès qu'une alerte le concerne. Fermer la fenêtre laisse M-Alert actif en arrière-plan (icône près de l'horloge) ; réglez le lancement au démarrage dans ⚙ Réglages.

`SHA256SUMS.txt` contient les sommes de contrôle des fichiers.
