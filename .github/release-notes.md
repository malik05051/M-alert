Alertes météo en temps réel par département, avec la carte de vigilance Météo-France.

## Nouveautés de la 1.2.2
- Carte plus sobre : les départements en alerte ne clignotent plus, ont la même luminosité que la vigilance et les mêmes frontières noires.

## Nouveautés de la 1.2.1
- Contour des départements en alerte plus fin.
- La carte ne se dézoome plus au-delà de la France entière.

## Nouveautés de la 1.2.0
- **Beaucoup plus léger** : la carte ne fait plus ramer l'ordinateur, et les animations se mettent en pause quand M-Alert est caché dans la zone de notification.
- **Sons d'alerte** : un son pour les informations, un pour le jaune et l'orange, un pour le rouge, et un pour la majeure, les tsunamis et les vagues-submersion.
- **Alertes modifiées** : une alerte corrigée est mise à jour en direct ; elle sonne de nouveau si le niveau monte ou si votre département est ajouté.
- **Clignotement** réservé aux départements en alerte rouge ou majeure, désactivable dans ⚙ Réglages.

## Installation

### Windows 10 / 11
- **`M-Alert-Setup-….exe`** : installateur (recommandé). **Se met à jour automatiquement** : les nouvelles versions sont téléchargées en arrière-plan et installées au redémarrage de M-Alert.
- **`M-Alert-Portable-….exe`** : version sans installation (prévient seulement quand une nouvelle version sort).

L'application n'est pas signée numériquement : au premier lancement, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur ». Cliquez sur **Informations complémentaires** puis **Exécuter quand même**.

### Arch Linux
M-Alert est dans le dépôt pacman [malik05](https://github.com/malik05051/malik05-repo) (ajout du dépôt décrit dans son README), puis :

```console
# pacman -Syu m-alert
```

### Téléphone et navigateur
Version web : **https://malik05051.github.io/M-alert/** — sur téléphone, « Ajouter à l'écran d'accueil » puis activez les notifications push dans les réglages pour être prévenu application fermée.

### Autres distributions Linux
- **`M-Alert-….AppImage`** : toutes distributions, se met à jour automatiquement. `chmod +x M-Alert-*.AppImage` puis lancez-le.
- **`M-Alert-…-amd64.deb`** : Debian, Ubuntu, Linux Mint… `sudo apt install ./M-Alert-*-amd64.deb`

## Premier lancement
Choisissez votre département : vous entendrez une alerte sonore et recevrez une notification dès qu'une alerte le concerne. Fermer la fenêtre laisse M-Alert actif en arrière-plan (icône près de l'horloge) ; réglez le lancement au démarrage dans ⚙ Réglages.

`SHA256SUMS.txt` contient les sommes de contrôle des fichiers. Les fichiers `latest*.yml` et `.blockmap` servent aux mises à jour automatiques.
