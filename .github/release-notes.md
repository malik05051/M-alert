Alertes météo en temps réel par département, avec la carte de vigilance Météo-France.

## Nouveautés de la 1.5.1
- Alertes **sans date de fin** : elles restent en vigueur jusqu'à leur levée par M-Alert (« jusqu'à levée de l'alerte »).

## Nouveautés de la 1.5.0
- **Filtre par phénomène** : dans ⚙ Réglages, choisissez les phénomènes météo pour lesquels vous voulez être alerté (orages, canicule…) ; la liste « Alertes en cours » se filtre aussi par catégorie ou par phénomène.
- **Blocus / manifestation** : trois niveaux, **Avis** (jaune), **Avertissement** (rouge) et **Avertissement majeur** (rose).
- Les alertes peuvent désormais être **planifiées** à l'avance par M-Alert.
- **Nouveau logo** : le M blanc sur triangle rouge.

## Nouveautés de la 1.4.4
- Les alertes **vagues-submersion** sont tracées sur les côtes touchées, comme les tsunamis.

## Nouveautés de la 1.4.3
- À l'ouverture, M-Alert affiche les alertes émises pendant qu'il était fermé, et seulement celles-là.
- Si votre département est **ajouté à une alerte existante** (ou si son niveau monte), l'alerte sonne, en direct ou à l'ouverture si M-Alert était fermé, même avec « Recevoir les alertes de toute la France » coché.
- Version web : les vrais sons d'alerte sont joués sous Firefox et Safari (au lieu d'une sirène générique).

## Nouveautés de la 1.4.2
- Tremblements de terre : la **profondeur** du séisme est affichée quand elle est connue.

## Nouveautés de la 1.4.1
- **Son** : « Couper le son » et « J'ai compris » arrêtent désormais toujours le son, même s'il a démarré en retard.
- Si le navigateur a bloqué le son d'une alerte, elle sonne au premier clic sur la page.

## Nouveautés de la 1.4.0
- **Tremblements de terre** : quatre niveaux (Faible, Moyen, Élevé, Majeur), magnitude, intensité maximale en **shindo** et **croix ✕ sur l'épicentre**.
- L'alerte séisme s'affiche en **bandeau compact en haut** de l'écran : la carte reste visible avec l'épicentre et les départements concernés.

## Nouveautés de la 1.3.0
- **Alertes tsunami** sur trois niveaux : **Avis de tsunami** (jaune), **Avertissement de tsunami** (rouge) et **Avertissement majeur de tsunami** (rose).
- Sur la carte, les côtes touchées par un tsunami sont tracées de la couleur du niveau, comme dans JQuake.

## Nouveautés de la 1.2.7
- Les alertes **tremblement de terre** jouent toujours le son EEW, quel que soit leur niveau.
- Le son des alertes **majeures** se répète jusqu'à « J'ai compris », sans limite de durée.

## Nouveautés de la 1.2.6
- Toutes les alertes **majeures** jouent le son majeur, même pour un tsunami ou des crues.
- **Mon département** : les cases Aujourd'hui et Demain tiennent compte des alertes M-Alert, en plus de la vigilance Météo-France.
- Arch Linux : l'entrée « Rechercher des mises à jour » disparaît du menu de l'icône (pacman s'en charge).

## Nouveautés de la 1.2.5
- Nouvelle catégorie 🏭 **Accident industriel** (à la place d'Accident), avec les consignes officielles de mise à l'abri.
- Nouveau son pour les **crues**, la **pluie-inondation**, les **tsunamis** et les **vagues-submersion**.

## Nouveautés de la 1.2.4
- Fond de carte détaillé : seule la France est affichée, les autres pays sont masqués.

## Nouveautés de la 1.2.3
- Fond de carte détaillé réparé : il affichait « API KEY REQUIRED » (le fournisseur CARTO exige désormais une clé). Il utilise maintenant le fond sombre d'Esri, avec les noms de villes.

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
