# dsh-jira — tickets Jira dans le Harness

Plugin hors-dépôt pour DeepSeek Harness : une vue « Tickets Jira » dans le
Harness Web, avec les espaces visibles paramétrables dans le patch Cordis, un
filtre multi-espaces, un filtre par état, la recherche plein texte, le détail
d'un ticket, et les écritures (créer, changer d'état, commenter).

Les deux moitiés vivent dans ce paquet, sans build : `index.js` (hôte) porte le
client REST Jira, les routes HTTP et les préférences ; `client.js` (navigateur)
enregistre l'icône de la barre latérale, le panneau principal et l'onglet de la
barre droite. Le jeton Jira ne quitte jamais le processus hôte.

## Prérequis

- Harness ≥ `0.2.0-rc.1` (testé sur `0.2.1-rc.3`).
- Un site Jira Cloud et un jeton API (https://id.atlassian.com/manage-profile/security/api-tokens).
- Un fichier dotenv lisible par l'hôte, par défaut `~/.config/dsh-jira/jira.env` :

```sh
JIRA_BASE=https://mon-site.atlassian.net
JIRA_EMAIL=moi@exemple.fr
JIRA_API_TOKEN=xxxxxxxxxxxxxxxxxxxxx
```

`JIRA_BASE_URL` est accepté comme alias de `JIRA_BASE`. La même clé peut venir
de `config` (voir plus bas) ou de l'environnement du processus hôte ; l'ordre de
résolution est `config` → environnement → fichier.

## Installation

Le paquet s'installe depuis ce dépôt GitHub (`dsh` étant le CLI fourni par
l'application, ou le CLI npm global) :

```sh
# Application de bureau (profil desktop) : quitter complètement l'application
# avant l'installation, puis la relancer.
dsh plugin --profile desktop add github:pimili-app/dsh-jira

# Harness en ligne de commande (profil web)
dsh plugin --profile web add github:pimili-app/dsh-jira
```

Le profil `desktop` est géré par l'application Electron : le CLI refuse
l'installation tant que l'application est ouverte. Pour installer avec le CLI
fourni par l'application, l'activer via le menu « Gérer la commande dsh » →
Installer.

Vérifier ensuite `~/.dsh/profiles/desktop/package.json` : `dsh.profile.bundles`
doit contenir `"dsh-jira-plugin"`. Un paquet présent seulement dans
`dependencies` ne monte aucune couche, et le journal de démarrage affiche
`patch: entry "jira" not found`.

### Développement (lien local)

```sh
dsh plugin --profile web add link:~/dsh-plugins/dsh-jira
dsh --profile web     # relancer le serveur Web
```

L'ajout d'un **bundle** (modification de `package.json`) demande un redémarrage
du serveur ; les patches, eux, sont rechargés à chaud. Recharger ensuite l'onglet
du navigateur pour reconstruire `window.__DSH_BOOT__`.

## Configuration

Tout passe par `cordis.patch.yml`, donc rechargé à chaud sur le profil `web` :

```yaml
- insert:
    - id: jira
      name: 'dsh-jira-plugin'
      config:
        spaces: [ABC, OPS]                    # espaces visibles, dans cet ordre
        envFile: ~/.config/dsh-jira/jira.env    # défaut
        # baseUrl / email / apiToken : surcharges, à éviter pour le jeton
```

| Clé | Défaut | Rôle |
|---|---|---|
| `spaces` | tous les projets du jeton | Clés de projet Jira proposées dans la vue (et seules autorisées côté API). |
| `envFile` | `~/.config/dsh-jira/jira.env` | Fichier dotenv lu par l'hôte pour les clés manquantes. |
| `baseUrl` / `email` / `apiToken` | — | Surchargent l'environnement et le fichier. |
| `requireAuth` | `true` | Exige le garde-fou `connection` de DSH (Host/Origin + cookie de session) sur chaque requête de l'API. |

Une clé inconnue dans `spaces` est ignorée avec un avertissement dans le journal
de l'hôte. Une liste `spaces` vide ou absente = tous les projets visibles par le
jeton.

## Utilisation

- **Icône « Jira »** dans la barre latérale : ouvre le panneau principal.
- **Espaces** : puces multi-sélection, limitées à `config.spaces`.
- **États** : puces multi-sélection, alimentées par les workflows réels des
  espaces sélectionnés (`À faire`, `En cours`, `Revue en cours`, `Terminé`, et
  `Discovery`/`Livraison`/… pour l'espace produit).
- **Recherche** : plein texte Jira (`text ~ "…"`), 300 ms de debounce.
- **Assignation** : « Mes tickets » (`assignee = currentUser()`) ou « Tous ».
- **Ligne cliquée** : détail, description, commentaires, changement d'état
  (transitions proposées par Jira) et ajout de commentaire.
- **Nouveau ticket** : espace, type (types créables réels de l'espace),
  résumé, description.
- L'onglet de la barre latérale droite affiche la même vue, repliée en colonne ;
  le bouton d'agrandissement en fait une vue plein écran.

Les filtres sélectionnés sont enregistrés dans `.settings.json` (à côté de
`index.js`) et rechargés à l'ouverture suivante.

## API HTTP

Routes servies par la moitié hôte, JSON, préfixe `/jira/api` :

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/meta` | Espaces, espaces visibles, états par espace, types créables, préférences, état des identifiants. |
| GET | `/issues?spaces=&statuses=&assignee=&query=&max=` | Liste filtrée (max 100, `truncated` au-delà). |
| GET | `/issues/<KEY>` | Détail, description en texte, commentaires. |
| GET | `/issues/<KEY>/transitions` | Transitions autorisées. |
| POST | `/issues/<KEY>/transition` | `{ id }` → nouveau statut. |
| POST | `/issues/<KEY>/comment` | `{ body }` → commentaire créé. |
| POST | `/issues` | `{ space, summary, description, type }` → ticket créé. |
| POST | `/prefs` | `{ spaces, statuses, assignee, query }` → sélection enregistrée. |

Les erreurs sont `{ ok: false, error: "<message Jira>" }` avec le code HTTP
correspondant (`400` validation, `502` identifiants/Jira, `504` délai). Les
écritures refusent une origine étrangère (hors même origine, `dsh-app://`).

## Sécurité

- Le jeton reste dans le processus hôte : la moitié navigateur ne reçoit que
  `configured`, `baseUrl` et `email`.
- Les écritures vérifient l'en-tête `Origin` ; les lectures ne renvoient aucun
  en-tête CORS, donc une page tierce ne peut pas lire les réponses.
- L'API est limitée aux espaces de `config.spaces` : une clé hors liste est
  rejetée avant tout appel Jira.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Rien dans l'interface | Le bundle n'est pas dans `dsh.profile.bundles` (le journal dit `patch: entry "jira" not found`). |
| « Jira n'est pas configuré » dans la vue | `config.envFile` introuvable ou clés manquantes ; `GET /jira/api/meta` le dit. |
| `502` avec message Jira | Jeton expiré ou droits insuffisants sur le projet. |
| Onglet absent après installation | L'application n'a pas été relancée (l'ajout d'un bundle n'est pas rechargé à chaud). |

## Désinstallation

```sh
dsh plugin --profile desktop remove dsh-jira-plugin   # ou --profile web
```

Puis redémarrer l'application. Le fichier `.settings.json` du paquet peut être
supprimé sans conséquence.

## Limites connues

- Jira Cloud uniquement (REST v3, ADF) ; Jira Server/Data Center non testé.
- Pas d'outils model-facing dans cette version : la vue est le seul point
  d'entrée. Les routes HTTP sont déjà là pour en ajouter.
- Pas de pièces jointes, de sous-tâches, ni d'édition de champs arbitraires.
