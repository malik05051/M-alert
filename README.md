# M-Alert

Cette application diffuse des informations que j'envoie via mon module M-Alert, en fonction du département.

Pour recevoir les alertes que j'envoie (dont la source vient des centres météorologiques français comme Météo-France), il faut configurer votre département dans les réglages ou à la première ouverture de l'application.

![Alerte rouge reçue dans M-Alert](docs/alerte.png)

<img src="docs/mobile.png" alt="M-Alert sur téléphone" width="260">

## Fonctionnalités

- **Carte interactive** des départements, colorés selon la **vigilance Météo-France** (vert, jaune, orange, rouge, et rose pour le niveau **majeur** fixé par M-Alert), pour aujourd'hui et demain. Survolez un département pour voir les phénomènes (orages, vent, crues…).
- **Alerte plein écran** dans le style de JQuake / GlobalQuake : cadre clignotant à la couleur du niveau, titre, départements concernés, description et consignes.
- **Son d'alerte** selon le niveau (information ; jaune et orange ; rouge ; majeure), avec un son dédié aux crues, inondations, tsunamis et vagues-submersion. Pour l'orange et le rouge, le son peut être répété jusqu'à « J'ai compris » ; le son majeur se répète toujours jusqu'à « J'ai compris ».
- **Notification système** avec la description de l'alerte.
- **Tremblement de terre** : quatre niveaux, **Faible**, **Moyen**, **Élevé** et **Majeur**, avec la magnitude, la profondeur, l'intensité maximale (échelle japonaise **shindo**, de 0 à 7) et une **croix ✕ sur l'épicentre**. L'alerte s'affiche en **bandeau compact en haut** de l'écran pour laisser voir l'épicentre et les départements concernés.
- **Tsunami** : trois niveaux seulement, **Avis de tsunami** (jaune), **Avertissement de tsunami** (rouge) et **Avertissement majeur de tsunami** (rose), affichés comme dans JQuake par un trait de la couleur du niveau le long des côtes touchées.
- **Départements en alerte** remplis de la couleur du niveau, avec la même luminosité et les mêmes frontières noires que la vigilance.
- Les alertes envoyées pendant que l'application était fermée s'affichent au démarrage.
- Prévenu aussi quand la vigilance de vos départements passe en jaune, orange ou rouge (désactivable).
- **Fonctionne en arrière-plan** : fermer la fenêtre laisse M-Alert actif dans la zone de notification ; il reste connecté, sonne et réaffiche la fenêtre dès qu'une alerte arrive. Reconnexion immédiate après une mise en veille.
- Une alerte **modifiée** depuis M-Alert-sender est mise à jour en direct ; elle sonne de nouveau si son niveau monte ou si votre département vient d'être ajouté.
- La vigilance peut être **corrigée ou saisie à la main** depuis M-Alert-sender, que l'API Météo-France fonctionne ou soit en panne : badges « Vigilance corrigée » / « Vigilance manuelle » et mention « ✎ corrigé par M-Alert » sur les départements concernés.
- **Catégories d'alertes** : 🌦️ Météo, 🏚️ Tremblement de terre, 🌊 Tsunami, 🌫️ Pollution, 🏭 Accident industriel, 📢 Grève, 🚧 Blocus / manifestation, chacune avec ses consignes. Chaque catégorie peut être désactivée dans les réglages.
- **Réglages** : département principal, autres départements suivis, catégories d'alertes reçues, alertes de toute la France, niveau minimum, son et volume, notifications, notifications push, fond de carte détaillé, lancement au démarrage, adresse du serveur.

## Utilisation

### Application de bureau (Windows et Linux)

| Système | Fichier |
| --- | --- |
| Windows 10/11 | `M-Alert-Setup-x.y.z.exe` (installateur) ou `M-Alert-Portable-x.y.z.exe` (sans installation) |
| Linux | `M-Alert-x.y.z.AppImage` (toutes distributions) ou `M-Alert-x.y.z-amd64.deb` (Debian, Ubuntu, Mint…) |

Ces fichiers sont construits automatiquement par GitHub à chaque modification : onglet **Actions** > **Applications de bureau** > dernier passage > *Artifacts*. En poussant un tag `v1.0.0`, ils sont joints à une *Release*.

Pour la lancer depuis le code source :

```bash
npm install
npm start            # lancer l'application
npm run dist:win     # installateur Windows (dans dist/)
npm run dist:linux   # AppImage + .deb (dans dist/)
```

**Mises à jour** : l'installateur Windows et l'AppImage se mettent à jour tout seuls. M-Alert vérifie les nouvelles versions au démarrage puis toutes les 6 heures, les télécharge en arrière-plan et les installe au prochain redémarrage (un bandeau propose « Redémarrer et installer »). La version portable et le `.deb` préviennent simplement qu'une nouvelle version est disponible. Sous Arch, c'est `pacman -Syu`. Réglages > Application > *Mises à jour* : vérification manuelle et désactivation.

**Arrière-plan** : quand on ferme la fenêtre, M-Alert continue de tourner dans la zone de notification (icône près de l'horloge) et reste à l'écoute des alertes. Clic droit sur l'icône : *Ouvrir*, *Réglages*, *Tester une alerte*, *Quitter*. Relancer M-Alert rouvre aussi la fenêtre. Dans les réglages :

- **Continuer en arrière-plan quand la fenêtre est fermée** (activé par défaut) ;
- **Lancer M-Alert au démarrage de l'ordinateur** : démarre caché dans la zone de notification (registre Windows, ou fichier `~/.config/autostart/fr.malert.app.desktop` sous Linux).

Sous Linux, l'icône de la zone de notification nécessite la prise en charge d'AppIndicator (présente par défaut sur Ubuntu, KDE, Cinnamon, XFCE ; sur GNOME « pur », installez l'extension *AppIndicator and KStatusNotifierItem Support*). Pour l'AppImage : `chmod +x M-Alert-*.AppImage` puis double-clic.

### Version web (téléphone, navigateur)

👉 **https://malik05051.github.io/M-alert/**


Le dossier `web/` est un site statique. Le workflow **Version web (GitHub Pages)** le publie automatiquement à chaque modification sur `main` (à activer une fois : *Settings > Pages > Source : GitHub Actions*).

Sur téléphone, l'application ne tourne pas en continu en arrière-plan : ce sont les **notifications push** qui préviennent quand elle est fermée. Ouvrez la page puis « Ajouter à l'écran d'accueil ». Cochez **Recevoir les alertes même quand l'application est fermée (push)** dans les réglages pour être notifié application fermée. Sur iPhone, les notifications push nécessitent iOS 16.4 ou plus et que M-Alert soit ajouté à l'écran d'accueil.

Pour tester en local : `npm run web` puis ouvrez http://localhost:5173.

## Configuration

Les alertes passent par le serveur M-Alert (dossier `server/` du dépôt **M-Alert-sender**). Indiquez son adresse dans `web/config.js` pour que les utilisateurs n'aient rien à saisir :

```js
window.MALERT_CONFIG = {
  serverUrl: 'https://mon-serveur-malert.onrender.com',
};
```

L'adresse reste modifiable dans les réglages de l'application.

## Sons d'alerte

Les sons sont dans `web/sounds/` :

| Fichier | Joué pour |
| --- | --- |
| `information.mp3` | Information |
| `eew.mp3` | **Tremblements de terre** (tous niveaux, majeure comprise), sinon jaune et orange |
| `rouge.mp3` | Rouge |
| `majeur.mp3` | Alertes **majeures** (rose), même tsunami ou crues, sauf tremblement de terre |
| `tsunami.mp3` | **Crues**, **pluie-inondation**, **tsunami** et **vagues-submersion** (sauf en majeure) |

Pour changer un son, remplacez le fichier en gardant son nom (sans fichier, une sirène synthétique est jouée). Réglages > **Tester une alerte** permet de vérifier le son, l'affichage et les notifications.

## Structure

```
main.js, preload.js     Application de bureau (Electron)
background.js           Arrière-plan : zone de notification, lancement au démarrage
updater.js              Mises à jour (electron-updater, Releases GitHub)
web/                    Interface (aussi utilisable comme site web)
  index.html, config.js
  js/app.js             Logique : connexion temps réel, alertes, réglages
  js/map.js             Carte des départements (Leaflet)
  js/sound.js           Son d'alerte
  sw.js                 Service worker (notifications push)
  data/departements.js  Contours des départements
  data/cotes.js         Trait de côte par département (alertes tsunami), généré par tools/build-coasts.js
  sounds/               Vos sons d'alerte
```

## Crédits

- Vigilance : © Météo-France (API « Données Publiques Vigilance »).
- Contours des départements : IGN Admin Express via [france-geojson](https://github.com/gregoiredavid/france-geojson) (Licence Ouverte). Frontières terrestres retirées du trait de côte avec [Natural Earth](https://www.naturalearthdata.com) (domaine public).
- Carte : [Leaflet](https://leafletjs.com) (BSD-2). Fond de carte détaillé : © Esri, HERE, Garmin, © OpenStreetMap (ArcGIS World Dark Gray Canvas).
