/**
 * Jira tickets — browser half.
 *
 * Registers the `jira` global panel (sidebar icon + main panel) and the same
 * view as a right-sidebar tab type. The Host half serves the JSON API under
 * `/jira/api` (meta, issues list, one issue, transitions, transition, comment,
 * create, prefs); this file only reads `credentials.baseUrl` /
 * `credentials.email` and never sees the token. Text goes through the Client
 * locale service and styling uses Harness theme tokens only.
 */
window.__ModuleLoader__.load({
  id: 'dsh-jira-plugin',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-jira-plugin'
    const API = '/jira/api'
    const PANEL_KIND = 'jira'
    const TAB_TYPE_ID = 'dsh-jira-plugin'
    const LIST_MAX = 50
    const ISSUE_TYPE_FALLBACK = ['Bug', 'Task', 'Story']
    const EMPTY_FILTERS = { spaces: [], statuses: [], assignee: 'me', query: '' }

    const MINUTE = 60 * 1000
    const HOUR = 60 * MINUTE
    const DAY = 24 * HOUR
    const WEEK = 7 * DAY

    const EN = {
      'nav.label': 'Jira',
      title: 'Jira tickets',
      subtitle: 'Browse, comment and update tickets',
      'guide.description': 'List and edit Jira tickets',
      'action.refresh': 'Refresh',
      'action.new': 'New ticket',
      'action.retry': 'Retry',
      'action.cancel': 'Cancel',
      'action.create': 'Create',
      'action.back': 'Back',
      'action.comment': 'Comment',
      'action.transition': 'Change status',
      'creds.missing': 'Jira not configured',
      'creds.configured': 'Configured',
      'config.title': 'Jira is not configured',
      'config.hint':
        'Fill in `config` in the plugin cordis patch: the visible `spaces`, then `baseUrl`, `email` and `apiToken` (or `envFile`) for the host side. Restart the Harness afterwards.',
      'config.sample': 'config:\n  spaces: [ABC, OPS]\n  envFile: ~/.config/dsh-jira/jira.env',
      'config.reload': 'Reload configuration',
      'filters.spaces': 'Spaces',
      'filters.statuses': 'Statuses',
      'filters.assignee': 'Assignee',
      'filters.mine': 'My tickets',
      'filters.all': 'All',
      'filters.statusAll': 'All',
      'filters.search': 'Search a ticket…',
      'filters.noSpaces': 'No visible space in the configuration.',
      'filters.prefsFailed': 'Filters not saved',
      'meta.loading': 'Loading the Jira configuration…',
      'meta.error': 'Could not load the Jira plugin configuration.',
      'list.count': '{count} tickets',
      'list.countOne': '{count} ticket',
      'list.truncated': 'first 50 results',
      'list.loading': 'Loading…',
      'list.emptyTitle': 'No ticket matches',
      'list.emptyHint': 'Adjust the filters or create a ticket.',
      'list.reset': 'Reset filters',
      'list.error': 'Could not load tickets.',
      'detail.loading': 'Loading the ticket…',
      'detail.error': 'Could not load this ticket.',
      'detail.dialog': 'Ticket detail',
      'detail.open': 'Open in Jira',
      'detail.description': 'Description',
      'detail.noDescription': 'No description.',
      'detail.comments': 'Comments',
      'detail.noComments': 'No comment yet.',
      'detail.commentPlaceholder': 'Write a comment…',
      'detail.commentAdded': 'Comment added',
      'detail.transitionUpdated': 'Status updated',
      'detail.changeStatus': 'Status',
      'detail.noTransitions': 'No transition available.',
      'detail.transitionsError': 'Could not load the transitions.',
      'detail.meta.type': 'Type',
      'detail.meta.priority': 'Priority',
      'detail.meta.assignee': 'Assignee',
      'detail.meta.reporter': 'Reporter',
      'detail.meta.space': 'Space',
      'detail.meta.created': 'Created',
      'detail.meta.updated': 'Updated',
      'create.title': 'New ticket',
      'create.space': 'Space',
      'create.type': 'Type',
      'create.summary': 'Summary',
      'create.summaryPlaceholder': 'Short summary',
      'create.description': 'Description',
      'create.descriptionPlaceholder': 'Details, steps to reproduce…',
      'create.required': 'A summary is required.',
      'create.done': 'Ticket created',
      'assignee.none': 'Unassigned',
      'time.now': 'just now',
      'time.minute': '{count} min',
      'time.hour': '{count} h',
      'time.day': '{count} d',
    }

    const FR = {
      'nav.label': 'Jira',
      title: 'Tickets Jira',
      subtitle: 'Consulter, commenter et mettre à jour les tickets',
      'guide.description': 'Lister et modifier les tickets Jira',
      'action.refresh': 'Rafraîchir',
      'action.new': 'Nouveau ticket',
      'action.retry': 'Réessayer',
      'action.cancel': 'Annuler',
      'action.create': 'Créer',
      'action.back': 'Retour',
      'action.comment': 'Commenter',
      'action.transition': 'Changer l’état',
      'creds.missing': 'Jira non configuré',
      'creds.configured': 'Configuré',
      'config.title': 'Jira n’est pas configuré',
      'config.hint':
        'Renseignez « config » dans le patch cordis du plugin : les `spaces` visibles, puis `baseUrl`, `email` et `apiToken` (ou `envFile`) côté hôte. Redémarrez le Harness ensuite.',
      'config.sample': 'config:\n  spaces: [ABC, OPS]\n  envFile: ~/.config/dsh-jira/jira.env',
      'config.reload': 'Recharger la configuration',
      'filters.spaces': 'Espaces',
      'filters.statuses': 'États',
      'filters.assignee': 'Assigné',
      'filters.mine': 'Mes tickets',
      'filters.all': 'Tous',
      'filters.statusAll': 'Tous',
      'filters.search': 'Rechercher un ticket…',
      'filters.noSpaces': 'Aucun espace visible dans la configuration.',
      'filters.prefsFailed': 'Filtres non enregistrés',
      'meta.loading': 'Chargement de la configuration Jira…',
      'meta.error': 'Impossible de charger la configuration du plugin Jira.',
      'list.count': '{count} tickets',
      'list.countOne': '{count} ticket',
      'list.truncated': '50 premiers résultats',
      'list.loading': 'Chargement…',
      'list.emptyTitle': 'Aucun ticket ne correspond',
      'list.emptyHint': 'Ajustez les filtres ou créez un ticket.',
      'list.reset': 'Réinitialiser les filtres',
      'list.error': 'Impossible de charger les tickets.',
      'detail.loading': 'Chargement du ticket…',
      'detail.error': 'Impossible de charger ce ticket.',
      'detail.dialog': 'Détail du ticket',
      'detail.open': 'Ouvrir dans Jira',
      'detail.description': 'Description',
      'detail.noDescription': 'Pas de description.',
      'detail.comments': 'Commentaires',
      'detail.noComments': 'Aucun commentaire.',
      'detail.commentPlaceholder': 'Écrire un commentaire…',
      'detail.commentAdded': 'Commentaire ajouté',
      'detail.transitionUpdated': 'État mis à jour',
      'detail.changeStatus': 'État',
      'detail.noTransitions': 'Aucune transition disponible.',
      'detail.transitionsError': 'Impossible de charger les transitions.',
      'detail.meta.type': 'Type',
      'detail.meta.priority': 'Priorité',
      'detail.meta.assignee': 'Assigné à',
      'detail.meta.reporter': 'Rapporteur',
      'detail.meta.space': 'Espace',
      'detail.meta.created': 'Créé',
      'detail.meta.updated': 'Mis à jour',
      'create.title': 'Nouveau ticket',
      'create.space': 'Espace',
      'create.type': 'Type',
      'create.summary': 'Résumé',
      'create.summaryPlaceholder': 'Résumé court',
      'create.description': 'Description',
      'create.descriptionPlaceholder': 'Détails, étapes de reproduction…',
      'create.required': 'Le résumé est obligatoire.',
      'create.done': 'Ticket créé',
      'assignee.none': 'Non assigné',
      'time.now': 'à l’instant',
      'time.minute': '{count} min',
      'time.hour': '{count} h',
      'time.day': '{count} j',
    }

    const CSS = `
.jr-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.45;background:var(--dsw-alias-bg-base);
--jr-accent:var(--dsw-alias-brand-primary);--jr-ok:var(--dsw-alias-state-success-primary);--jr-err:var(--dsw-alias-state-error-primary);--jr-warn:var(--dsw-alias-state-warn-primary);--jr-idle:var(--dsw-alias-state-idle-primary)}
.jr-head{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px 12px;padding:calc(var(--dsh-frame-top-clearance,0px) + 14px) 18px 10px}
.jr-head-main{min-width:140px;flex:1 1 auto}
.jr-title{display:flex;align-items:center;gap:9px;margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}
.jr-logo{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border-radius:9px;border:1px solid color-mix(in srgb,var(--jr-accent) 32%,transparent);background:linear-gradient(155deg,color-mix(in srgb,var(--jr-accent) 24%,transparent),color-mix(in srgb,var(--jr-accent) 6%,transparent))}
.jr-sub{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jr-actions{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:6px;flex:none}
.jr-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;cursor:pointer;text-decoration:none}
.jr-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.jr-btn:focus-visible,.jr-chip:focus-visible,.jr-btn:disabled{opacity:.5;cursor:default}
.jr-btn-primary{border-color:color-mix(in srgb,var(--jr-accent) 42%,transparent);background:color-mix(in srgb,var(--jr-accent) 15%,var(--dsw-alias-bg-layer-1));color:var(--jr-accent);font-weight:600}
.jr-btn-primary:hover:not(:disabled){background:color-mix(in srgb,var(--jr-accent) 24%,var(--dsw-alias-bg-layer-2))}
.jr-btn-icon{width:30px;padding:0;font-size:14px}
.jr-creds{display:inline-flex;align-items:center;gap:6px;max-width:260px;height:24px;padding:0 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.jr-creds[data-on=true]{border-color:color-mix(in srgb,var(--jr-ok) 38%,transparent);background:color-mix(in srgb,var(--jr-ok) 10%,transparent);color:var(--jr-ok)}
.jr-creds[data-on=false]{border-color:color-mix(in srgb,var(--jr-warn) 42%,transparent);background:color-mix(in srgb,var(--jr-warn) 10%,transparent);color:var(--jr-warn)}
.jr-creds-text{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jr-dot{width:7px;height:7px;border-radius:999px;flex:none;background:var(--jr-idle)}
.jr-dot[data-on=true]{background:var(--jr-ok)}
.jr-dot[data-on=false]{background:var(--jr-warn)}
.jr-hint{margin:0 18px 12px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--jr-warn) 32%,transparent);border-left:3px solid var(--jr-warn);border-radius:8px;background:color-mix(in srgb,var(--jr-warn) 7%,var(--dsw-alias-bg-layer-1))}
.jr-hint-title{margin:0 0 4px;font-size:12px;font-weight:700;color:var(--dsw-alias-label-primary)}
.jr-hint-body{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.jr-hint-code{margin:8px 0 0;padding:8px 10px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;white-space:pre;overflow:auto}
.jr-filters{display:flex;flex-direction:column;gap:7px;padding:0 18px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.jr-filter-row{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
.jr-filter-label{flex:none;margin-right:2px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.jr-chip{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
.jr-chip:hover{background:var(--dsw-alias-bg-layer-2)}
.jr-chip[aria-pressed=true]{border-color:color-mix(in srgb,var(--jr-accent) 45%,transparent);background:color-mix(in srgb,var(--jr-accent) 14%,transparent);color:var(--jr-accent)}
.jr-search{flex:1 1 180px;min-width:130px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.jr-search:focus{outline:2px solid var(--jr-accent);outline-offset:-1px}
.jr-seg{display:inline-flex;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden}
.jr-seg button{height:26px;padding:0 10px;border:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.jr-seg button:hover{background:var(--dsw-alias-bg-layer-2)}
.jr-seg button:focus-visible{outline:2px solid var(--jr-accent);outline-offset:-2px}
.jr-seg button[aria-pressed=true]{background:color-mix(in srgb,var(--jr-accent) 15%,var(--dsw-alias-bg-layer-1));color:var(--jr-accent)}
.jr-body{flex:1;min-height:0;overflow:auto}
.jr-status-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:30px;padding:6px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}
.jr-count b{color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums}
.jr-trunc{padding:1px 7px;border-radius:999px;border:1px solid color-mix(in srgb,var(--jr-warn) 35%,transparent);background:color-mix(in srgb,var(--jr-warn) 10%,transparent);color:var(--jr-warn);font-weight:600}
.jr-prefs-error{color:var(--jr-warn)}
.jr-msg{margin:0;padding:7px 18px;font-size:12px;color:var(--jr-err)}
.jr-msg-ok{color:var(--jr-ok)}
.jr-inline-error{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:10px 18px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--jr-err) 32%,transparent);border-left:3px solid var(--jr-err);border-radius:8px;background:color-mix(in srgb,var(--jr-err) 7%,var(--dsw-alias-bg-layer-1))}
.jr-inline-error-text{margin:0;font-size:12px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.jr-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:200px;padding:28px 24px;text-align:center}
.jr-state h2{margin:0;font-size:14px;font-weight:600}
.jr-state p{margin:0;max-width:420px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.jr-spin{width:12px;height:12px;flex:none;border-radius:999px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--jr-accent);animation:jr-spin .9s linear infinite}
@keyframes jr-spin{to{transform:rotate(360deg)}}
.jr-list{display:flex;flex-direction:column;min-height:0}
.jr-row{display:flex;align-items:center;flex-wrap:wrap;gap:5px 10px;width:100%;padding:9px 18px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);border-left:3px solid transparent;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.jr-row:hover{background:var(--dsw-alias-bg-layer-1);border-left-color:color-mix(in srgb,var(--jr-accent) 45%,transparent)}
.jr-row:focus-visible{outline:2px solid var(--jr-accent);outline-offset:-2px;background:var(--dsw-alias-bg-layer-1)}
.jr-key{flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;color:var(--jr-accent)}
.jr-summary{flex:1 1 150px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jr-row-meta{display:flex;align-items:center;gap:6px;flex:none;font-size:11px;color:var(--dsw-alias-label-secondary)}
.jr-badge{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:600;white-space:nowrap}
.jr-badge[data-tone=done]{border-color:color-mix(in srgb,var(--jr-ok) 42%,transparent);background:color-mix(in srgb,var(--jr-ok) 14%,transparent);color:var(--jr-ok)}
.jr-badge[data-tone=progress]{border-color:color-mix(in srgb,var(--jr-accent) 42%,transparent);background:color-mix(in srgb,var(--jr-accent) 14%,transparent);color:var(--jr-accent)}
.jr-badge[data-tone=new]{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jr-tag{flex:none;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.jr-avatar{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:700}
.jr-when{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums;opacity:.85}
.jr-detail{display:flex;flex-direction:column;flex:1 1 auto;gap:9px;min-height:0;overflow:auto;padding:12px 18px 22px}
.jr-detail-head{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.jr-detail-head .jr-btn{height:28px;padding:0 10px;font-size:11px}
.jr-link{display:inline-flex;align-items:center;gap:4px;margin-left:auto;padding:4px 6px;border-radius:6px;font-size:11px;font-weight:600;color:var(--jr-accent);text-decoration:none}
.jr-link:hover{background:var(--dsw-alias-bg-layer-2)}
.jr-link:focus-visible{outline:2px solid var(--jr-accent);outline-offset:1px}
.jr-detail-key{margin:2px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;color:var(--jr-accent)}
.jr-detail-title{margin:0;font-size:14px;font-weight:600;line-height:1.35}
.jr-meta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px 12px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.jr-meta-item{display:flex;flex-direction:column;min-width:0}
.jr-meta-label{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.jr-meta-value{font-size:12px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jr-section-title{margin:6px 0 0;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.jr-text{margin:0;font-size:12px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}
.jr-comments{display:flex;flex-direction:column;margin:0;padding:0;list-style:none;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.jr-comment{padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px}
.jr-comment:last-child{border-bottom:0}
.jr-comment-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.jr-comment-head b{color:var(--dsw-alias-label-primary);font-weight:600}
.jr-comment-body{margin:3px 0 0;white-space:pre-wrap;word-break:break-word}
.jr-field{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.jr-input{height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.jr-input:focus,.jr-select:focus,.jr-textarea:focus{outline:2px solid var(--jr-accent);outline-offset:-1px}
.jr-select{height:30px;max-width:100%;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.jr-textarea{width:100%;box-sizing:border-box;min-height:70px;padding:7px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.5;resize:vertical}
.jr-actions-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.jr-form{display:flex;flex-direction:column;gap:8px;margin:10px 18px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--jr-accent) 26%,var(--dsw-alias-border-l1));border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.jr-form h2{margin:0;font-size:13px;font-weight:600;color:var(--jr-accent)}
.jr-scrim{position:absolute;inset:0;z-index:5;border:0;padding:0;background:color-mix(in srgb,var(--dsw-alias-bg-base) 62%,transparent);cursor:pointer}
.jr-drawer{position:absolute;top:0;right:0;bottom:0;z-index:6;display:flex;flex-direction:column;width:min(560px,94%);border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:-18px 0 40px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent)}
.jr-root[data-layout=narrow] .jr-head,.jr-root[data-layout=narrow] .jr-filters,.jr-root[data-layout=narrow] .jr-filter-row{align-items:stretch}
.jr-root[data-layout=narrow] .jr-search{flex-basis:100%}
.jr-root[data-layout=narrow] .jr-status-bar,.jr-root[data-layout=narrow] .jr-row{padding-left:12px;padding-right:12px}
.jr-root[data-layout=narrow] .jr-detail{padding-left:12px;padding-right:12px}
.jr-root[data-layout=narrow] .jr-summary{flex-basis:100%}
.jr-root[data-layout=narrow] .jr-row-meta{flex-wrap:wrap}
`

    /* Host API: JSON helpers plus the query builder the list request uses. */

    function errorFrom(response, payload) {
      if (payload && typeof payload.error === 'string' && payload.error) return new Error(payload.error)
      return new Error(`HTTP ${response.status}`)
    }

    async function apiGet(path) {
      const response = await window.fetch(path, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw errorFrom(response, payload)
      return payload || {}
    }

    async function apiPost(path, body) {
      const response = await window.fetch(path, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || (payload && payload.ok === false)) throw errorFrom(response, payload)
      return payload || {}
    }

    function issuePath(key, suffix) {
      const base = `${API}/issues/${encodeURIComponent(key)}`
      return suffix ? `${base}/${suffix}` : base
    }

    /** Comma-joined array params, omitted when empty so the host applies no constraint. */
    function buildQuery(params) {
      const parts = []
      for (const key of Object.keys(params)) {
        const value = params[key]
        if (Array.isArray(value)) {
          if (value.length) parts.push(`${key}=${encodeURIComponent(value.join(','))}`)
          continue
        }
        if (value === null || value === undefined || value === '') continue
        parts.push(`${key}=${encodeURIComponent(String(value))}`)
      }
      return parts.length ? `?${parts.join('&')}` : ''
    }

    /* Display helpers. */

    /** Run every disposer, ignoring the ones an earlier teardown already released. */
    function disposeAll(disposers) {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          /* already disposed */
        }
      }
    }

    function describeError(error) {
      return error && error.message ? String(error.message) : String(error)
    }

    function statusTone(category) {
      if (category === 'done') return 'done'
      if (category === 'indeterminate') return 'progress'
      if (category === 'new') return 'new'
      return 'unknown'
    }

    function initials(name) {
      const parts = String(name || '').split(/\s+/).filter(Boolean)
      if (!parts.length) return '–'
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    }

    function formatDate(time) {
      const date = new Date(time)
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    }

    /** Short relative label for recent timestamps, `dd/mm/yyyy` beyond a week. */
    function formatWhen(value, t) {
      if (!value) return ''
      const time = Date.parse(String(value))
      if (Number.isNaN(time)) return ''
      const delta = Date.now() - time
      if (delta < MINUTE) return t('time.now')
      if (delta < HOUR) return t('time.minute', { count: Math.round(delta / MINUTE) })
      if (delta < DAY) return t('time.hour', { count: Math.round(delta / HOUR) })
      if (delta < WEEK) return t('time.day', { count: Math.round(delta / DAY) })
      return formatDate(time)
    }

    /** Status chips offered for the current space selection (all visible spaces when none is selected). */
    function statusOptions(meta, spaces) {
      if (!meta) return []
      const statuses = []
      for (const key of spaces && spaces.length ? spaces : meta.selectableSpaces || []) {
        for (const status of (meta.statuses && meta.statuses[key]) || []) {
          if (statuses.indexOf(status) === -1) statuses.push(status)
        }
      }
      return statuses
    }

    function spaceName(meta, key) {
      const found = ((meta && meta.spaces) || []).find((space) => space.key === key)
      return found ? found.name : key
    }

    /** Creatable types for one space; localized names come from the host's per-space map. */
    function issueTypesFor(meta, space) {
      const names = meta && meta.issueTypes ? meta.issueTypes[space] : null
      return Array.isArray(names) && names.length ? names : ISSUE_TYPE_FALLBACK
    }

    function filtersKeyOf(filters) {
      return JSON.stringify([filters.spaces, filters.statuses, filters.assignee, filters.query])
    }

    function IconMark({ size, color, accent }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, style: { display: 'block' } },
        h('rect', { x: 3.25, y: 5.25, width: 17.5, height: 13.5, rx: 3.25, stroke: color, strokeWidth: 1.6 }),
        h('path', { d: 'M7.5 9.75h9M7.5 12.5h9M7.5 15.25h5', stroke: accent || color, strokeWidth: 1.4, strokeLinecap: 'round', opacity: 0.65 }),
        h('circle', { cx: 18.1, cy: 6.2, r: 2.1, fill: accent || color }),
      )
    }

    function GuideArtwork(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20
      return h(IconMark, { size, color: 'currentColor', accent: 'var(--dsw-alias-brand-primary)' })
    }

    function SidebarIcon(props) {
      const color = props && props.active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)'
      const size = props && typeof props.size === 'number' ? props.size : 18
      return h(IconMark, { size, color, accent: 'var(--dsw-alias-brand-primary)' })
    }

    /* Panel. */

    function Panel({ t, inSidebar }) {
      const [meta, setMeta] = React.useState(null)
      const [metaError, setMetaError] = React.useState(null)
      const [metaToken, setMetaToken] = React.useState(0)
      const [filters, setFilters] = React.useState(EMPTY_FILTERS)
      const [queryDraft, setQueryDraft] = React.useState('')
      const [list, setList] = React.useState(null)
      const [listError, setListError] = React.useState(null)
      const [listLoading, setListLoading] = React.useState(false)
      const [listToken, setListToken] = React.useState(0)
      const [prefsError, setPrefsError] = React.useState(null)
      const [openKey, setOpenKey] = React.useState(null)
      const [detail, setDetail] = React.useState(null)
      const [detailError, setDetailError] = React.useState(null)
      const [detailLoading, setDetailLoading] = React.useState(false)
      const [detailToken, setDetailToken] = React.useState(0)
      const [transitions, setTransitions] = React.useState(null)
      const [transitionsError, setTransitionsError] = React.useState(null)
      const [transitionId, setTransitionId] = React.useState('')
      const [transitionBusy, setTransitionBusy] = React.useState(false)
      const [commentDraft, setCommentDraft] = React.useState('')
      const [commentBusy, setCommentBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [creating, setCreating] = React.useState(false)
      const [draft, setDraft] = React.useState(null)
      const [createBusy, setCreateBusy] = React.useState(false)
      const [createError, setCreateError] = React.useState(null)

      const mounted = React.useRef(true)
      const prefsApplied = React.useRef(false)
      const savedPrefs = React.useRef(null)
      const queryTimer = React.useRef(null)

      const filtersKey = filtersKeyOf(filters)
      const configured = Boolean(meta && meta.credentials && meta.credentials.configured)
      const detailOpen = Boolean(openKey)

      React.useEffect(() => {
        mounted.current = true
        return () => {
          mounted.current = false
          if (queryTimer.current) window.clearTimeout(queryTimer.current)
        }
      }, [])

      const loadMeta = React.useCallback(() => setMetaToken((value) => value + 1), [])

      React.useEffect(() => {
        let alive = true
        setMetaError(null)
        apiGet(`${API}/meta`)
          .then((payload) => {
            if (!alive) return
            setMeta(payload)
            if (prefsApplied.current) return
            prefsApplied.current = true
            const prefs = payload.prefs || {}
            const selectable = Array.isArray(payload.selectableSpaces) ? payload.selectableSpaces : []
            const spaces = (Array.isArray(prefs.spaces) ? prefs.spaces : []).filter((key) => selectable.indexOf(key) !== -1)
            const allowed = statusOptions(payload, spaces)
            const statuses = (Array.isArray(prefs.statuses) ? prefs.statuses : []).filter((status) => allowed.indexOf(status) !== -1)
            const next = { spaces, statuses, assignee: prefs.assignee === 'all' ? 'all' : 'me', query: typeof prefs.query === 'string' ? prefs.query : '' }
            setFilters(next)
            setQueryDraft(next.query)
            savedPrefs.current = filtersKeyOf(next)
          })
          .catch((error) => { if (alive) setMetaError(describeError(error)) })
        return () => { alive = false }
      }, [metaToken])

      // Persist the filter selection, debounced: a failed save never blocks the panel.
      React.useEffect(() => {
        if (!configured || savedPrefs.current === null || filtersKey === savedPrefs.current) return undefined
        const key = filtersKey
        const timer = window.setTimeout(() => {
          apiPost(`${API}/prefs`, { spaces: filters.spaces, statuses: filters.statuses, assignee: filters.assignee, query: filters.query })
            .then(() => {
              savedPrefs.current = key
              if (mounted.current) setPrefsError(null)
            })
            .catch((error) => {
              if (mounted.current) setPrefsError(describeError(error))
            })
        }, 450)
        return () => window.clearTimeout(timer)
      }, [filtersKey, configured])

      React.useEffect(() => {
        if (!configured) return undefined
        let alive = true
        setListLoading(true)
        setListError(null)
        // An empty space selection means "every visible space"; the host would
        // otherwise fall back to its stored prefs instead.
        const spaces = filters.spaces.length ? filters.spaces : (meta && meta.selectableSpaces) || []
        const search = buildQuery({ spaces, statuses: filters.statuses, assignee: filters.assignee, query: filters.query.trim(), max: LIST_MAX })
        apiGet(`${API}/issues${search}`)
          .then((payload) => {
            if (!alive) return
            const issues = Array.isArray(payload.issues) ? payload.issues : []
            setList({ issues, count: typeof payload.count === 'number' ? payload.count : 0, truncated: Boolean(payload.truncated) })
          })
          .catch((error) => {
            if (!alive) return
            setList(null)
            setListError(describeError(error))
          })
          .finally(() => { if (alive) setListLoading(false) })
        return () => { alive = false }
      }, [configured, meta, filtersKey, listToken])

      React.useEffect(() => {
        if (!openKey) {
          setDetail(null)
          setDetailError(null)
          setDetailLoading(false)
          setTransitions(null)
          setTransitionsError(null)
          setTransitionId('')
          return undefined
        }
        let alive = true
        setDetailLoading(true)
        setDetailError(null)
        setTransitions(null)
        setTransitionsError(null)
        setTransitionId('')
        apiGet(issuePath(openKey))
          .then((payload) => {
            if (alive) setDetail(payload)
          })
          .catch((error) => {
            if (!alive) return
            setDetail(null)
            setDetailError(describeError(error))
          })
          .finally(() => { if (alive) setDetailLoading(false) })
        apiGet(`${issuePath(openKey)}/transitions`)
          .then((payload) => {
            if (!alive) return
            const next = Array.isArray(payload.transitions) ? payload.transitions : []
            setTransitions(next)
            setTransitionId(next.length ? String(next[0].id) : '')
          })
          .catch((error) => { if (alive) setTransitionsError(describeError(error)) })
        return () => { alive = false }
      }, [openKey, detailToken])

      // A different ticket starts from an empty comment box.
      React.useEffect(() => {
        setCommentDraft('')
      }, [openKey])

      function commitQuery(value) {
        setFilters((current) => (current.query === value ? current : { ...current, query: value }))
      }

      function onQueryChange(event) {
        const value = event.target.value
        setQueryDraft(value)
        if (queryTimer.current) window.clearTimeout(queryTimer.current)
        queryTimer.current = window.setTimeout(() => {
          queryTimer.current = null
          commitQuery(value)
        }, 300)
      }

      function onQueryKeyDown(event) {
        if (event.key !== 'Enter') return
        event.preventDefault()
        if (queryTimer.current) {
          window.clearTimeout(queryTimer.current)
          queryTimer.current = null
        }
        commitQuery(queryDraft)
      }

      function toggleSpace(key) {
        setFilters((current) => {
          const spaces = current.spaces.indexOf(key) === -1 ? [...current.spaces, key] : current.spaces.filter((item) => item !== key)
          const allowed = statusOptions(meta, spaces)
          return { ...current, spaces, statuses: current.statuses.filter((status) => allowed.indexOf(status) !== -1) }
        })
      }

      function toggleStatus(status) {
        setFilters((current) => ({
          ...current,
          statuses: current.statuses.indexOf(status) === -1 ? [...current.statuses, status] : current.statuses.filter((item) => item !== status),
        }))
      }

      function clearStatuses() {
        setFilters((current) => ({ ...current, statuses: [] }))
      }

      function setAssignee(value) {
        setFilters((current) => (current.assignee === value ? current : { ...current, assignee: value }))
      }

      function resetFilters() {
        setQueryDraft('')
        setFilters({ spaces: [], statuses: [], assignee: 'me', query: '' })
      }

      function refreshAll() {
        setNotice(null)
        loadMeta()
        setListToken((value) => value + 1)
        if (openKey) setDetailToken((value) => value + 1)
      }

      function openIssue(key) {
        setNotice(null)
        setOpenKey(key)
      }

      function closeDetail() {
        setOpenKey(null)
      }

      function startCreate() {
        const selectable = (meta && meta.selectableSpaces) || []
        const space = (filters.spaces.length ? filters.spaces[0] : selectable[0]) || ''
        setNotice(null)
        setCreateError(null)
        setDraft({ space, type: issueTypesFor(meta, space)[0], summary: '', description: '' })
        setCreating(true)
        setOpenKey(null)
      }

      function cancelCreate() {
        setCreating(false)
        setDraft(null)
        setCreateError(null)
      }

      function changeDraftSpace(space) {
        setDraft((current) => (current ? { ...current, space, type: issueTypesFor(meta, space)[0] || current.type } : current))
      }

      const submitTransition = React.useCallback(async () => {
        if (!openKey || !transitionId) return
        setTransitionBusy(true)
        setNotice(null)
        try {
          const answer = await apiPost(`${issuePath(openKey)}/transition`, { id: transitionId })
          if (!mounted.current) return
          const status = answer && typeof answer.status === 'string' ? answer.status : ''
          setNotice({ kind: 'ok', text: status ? `${t('detail.transitionUpdated')} · ${status}` : t('detail.transitionUpdated') })
          setDetailToken((value) => value + 1)
          setListToken((value) => value + 1)
        } catch (error) {
          if (mounted.current) setNotice({ kind: 'error', text: describeError(error) })
        } finally {
          if (mounted.current) setTransitionBusy(false)
        }
      }, [openKey, transitionId, t])

      const submitComment = React.useCallback(async () => {
        const body = commentDraft.trim()
        if (!openKey || !body) return
        setCommentBusy(true)
        setNotice(null)
        try {
          await apiPost(`${issuePath(openKey)}/comment`, { body })
          if (!mounted.current) return
          setCommentDraft('')
          setNotice({ kind: 'ok', text: t('detail.commentAdded') })
          setDetailToken((value) => value + 1)
          setListToken((value) => value + 1)
        } catch (error) {
          if (mounted.current) setNotice({ kind: 'error', text: describeError(error) })
        } finally {
          if (mounted.current) setCommentBusy(false)
        }
      }, [commentDraft, openKey, t])

      const submitCreate = React.useCallback(async () => {
        if (!draft) return
        const summary = draft.summary.trim()
        if (!summary) { setCreateError(t('create.required')); return }
        setCreateBusy(true)
        setCreateError(null)
        try {
          // The host answers with the full detail object, so the drawer opens on it directly.
          const answer = await apiPost(`${API}/issues`, { space: draft.space, summary, description: draft.description, type: draft.type })
          if (!mounted.current) return
          setCreating(false)
          setDraft(null)
          setNotice({ kind: 'ok', text: t('create.done') })
          setDetail(answer)
          setOpenKey(answer && answer.key ? answer.key : null)
          setListToken((value) => value + 1)
        } catch (error) {
          if (mounted.current) setCreateError(describeError(error))
        } finally {
          if (mounted.current) setCreateBusy(false)
        }
      }, [draft, t])

      function renderCreds() {
        const credentials = (meta && meta.credentials) || {}
        const isConfigured = Boolean(credentials.configured)
        const on = isConfigured ? 'true' : 'false'
        const hint = isConfigured ? credentials.email || credentials.baseUrl || '' : t('config.title')
        const label = isConfigured ? credentials.baseUrl || t('creds.configured') : t('creds.missing')
        return h(
          'span',
          { className: 'jr-creds', 'data-on': on, title: hint },
          h('span', { className: 'jr-dot', 'data-on': on, 'aria-hidden': true }),
          h('span', { className: 'jr-creds-text' }, label),
        )
      }

      function renderHeader() {
        return h(
          'header',
          { className: 'jr-head' },
          h('div', { className: 'jr-head-main' },
            h('h1', { className: 'jr-title' },
              h('span', { className: 'jr-logo', 'aria-hidden': true }, h(IconMark, { size: 18, color: 'var(--dsw-alias-brand-primary)', accent: 'var(--dsw-alias-brand-primary)' })),
              t('title'),
            ),
            h('p', { className: 'jr-sub' }, t('subtitle')),
          ),
          h('div', { className: 'jr-actions' },
            renderCreds(),
            h('button', { type: 'button', className: 'jr-btn jr-btn-icon', title: t('action.refresh'), 'aria-label': t('action.refresh'), onClick: refreshAll }, '⟳'),
            h('button', { type: 'button', className: 'jr-btn jr-btn-primary', onClick: startCreate, disabled: !configured || creating }, t('action.new')),
          ),
        )
      }

      function renderNoticeBar() {
        if (!notice) return null
        return h('p', { className: notice.kind === 'ok' ? 'jr-msg jr-msg-ok' : 'jr-msg', role: 'status' }, notice.text)
      }

      function renderConfigHint() {
        return h('div', { className: 'jr-hint' },
          h('p', { className: 'jr-hint-title' }, t('config.title')),
          h('p', { className: 'jr-hint-body' }, t('config.hint')),
          h('pre', { className: 'jr-hint-code' }, t('config.sample')),
          h('div', { className: 'jr-actions-row', style: { marginTop: 8 } }, h('button', { type: 'button', className: 'jr-btn', onClick: loadMeta }, t('config.reload'))),
        )
      }

      function renderFilters() {
        const selectable = (meta && meta.selectableSpaces) || []
        const statuses = statusOptions(meta, filters.spaces)
        const chip = (key, label, active, onClick, title) =>
          h('button', { key, type: 'button', className: 'jr-chip', 'aria-pressed': active, title, onClick }, label)
        return h('div', { className: 'jr-filters' },
          selectable.length
            ? h('div', { className: 'jr-filter-row' },
                h('span', { className: 'jr-filter-label' }, t('filters.spaces')),
                selectable.map((key) => chip(key, key, filters.spaces.indexOf(key) !== -1, () => toggleSpace(key), `${key} · ${spaceName(meta, key)}`)),
              )
            : h('p', { className: 'jr-msg' }, t('filters.noSpaces')),
          statuses.length
            ? h('div', { className: 'jr-filter-row' },
                h('span', { className: 'jr-filter-label' }, t('filters.statuses')),
                chip('all', t('filters.statusAll'), filters.statuses.length === 0, clearStatuses),
                statuses.map((status) => chip(status, status, filters.statuses.indexOf(status) !== -1, () => toggleStatus(status))),
              )
            : null,
          h('div', { className: 'jr-filter-row' },
            h('input', {
              className: 'jr-search',
              type: 'text',
              value: queryDraft,
              placeholder: t('filters.search'),
              'aria-label': t('filters.search'),
              onChange: onQueryChange,
              onKeyDown: onQueryKeyDown,
            }),
            h('div', { className: 'jr-seg', role: 'group', 'aria-label': t('filters.assignee') },
              h('button', { type: 'button', 'aria-pressed': filters.assignee === 'me', onClick: () => setAssignee('me') }, t('filters.mine')),
              h('button', { type: 'button', 'aria-pressed': filters.assignee === 'all', onClick: () => setAssignee('all') }, t('filters.all')),
            ),
          ),
        )
      }

      function renderRow(issue) {
        const assignee = issue.assignee || ''
        return h('button',
          { key: issue.key, type: 'button', className: 'jr-row', onClick: () => openIssue(issue.key), title: issue.summary },
          h('span', { className: 'jr-key' }, issue.key),
          h('span', { className: 'jr-summary' }, issue.summary || ''),
          h('span', { className: 'jr-row-meta' },
            h('span', { className: 'jr-badge', 'data-tone': statusTone(issue.statusCategory) }, issue.status || '—'),
            issue.type ? h('span', { className: 'jr-tag' }, issue.type) : null,
            issue.priority ? h('span', { className: 'jr-tag' }, issue.priority) : null,
            h('span', { className: 'jr-avatar', title: assignee || t('assignee.none'), 'aria-label': assignee || t('assignee.none') }, initials(assignee)),
            h('span', { className: 'jr-when' }, formatWhen(issue.updated, t)),
          ),
        )
      }

      function renderList() {
        const issues = list ? list.issues : []
        const count = list ? list.count : 0
        const countLabel = count === 1 ? t('list.countOne', { count }) : t('list.count', { count })
        return h('div', { className: 'jr-list' },
          h('div', { className: 'jr-status-bar' },
            listLoading ? h('span', { className: 'jr-spin', 'aria-hidden': true }) : null,
            h('span', { className: 'jr-count' }, h('b', null, String(count)), ` ${countLabel}`),
            list && list.truncated ? h('span', { className: 'jr-trunc' }, t('list.truncated')) : null,
            prefsError ? h('span', { className: 'jr-prefs-error', title: prefsError }, t('filters.prefsFailed')) : null,
          ),
          listError
            ? h('div', { className: 'jr-inline-error' },
                h('p', { className: 'jr-inline-error-text' }, `${t('list.error')} ${listError}`),
                h('button', { type: 'button', className: 'jr-btn', onClick: () => setListToken((value) => value + 1) }, t('action.retry')),
              )
            : null,
          !listError && listLoading && !list
            ? h('div', { className: 'jr-state' }, h('span', { className: 'jr-spin', 'aria-hidden': true }), h('p', null, t('list.loading')))
            : null,
          !listError && list && issues.length === 0
            ? h('div', { className: 'jr-state' },
                h('h2', null, t('list.emptyTitle')),
                h('p', null, t('list.emptyHint')),
                h('button', { type: 'button', className: 'jr-btn', onClick: resetFilters }, t('list.reset')),
              )
            : null,
          issues.map(renderRow),
        )
      }

      function renderCreateForm() {
        if (!creating || !draft) return null
        const selectable = (meta && meta.selectableSpaces) || []
        const spaces = selectable.length
          ? selectable.map((key) => h('option', { key, value: key }, `${key} · ${spaceName(meta, key)}`))
          : [h('option', { key: 'none', value: '' }, t('filters.noSpaces'))]
        const field = (label, control) => h('label', { className: 'jr-field' }, h('span', null, label), control)
        return h('div', { className: 'jr-form' },
          h('h2', null, t('create.title')),
          field(t('create.space'), h('select', { className: 'jr-select', value: draft.space, onChange: (event) => changeDraftSpace(event.target.value) }, spaces)),
          field(t('create.type'), h('select', { className: 'jr-select', value: draft.type, onChange: (event) => setDraft({ ...draft, type: event.target.value }) },
            issueTypesFor(meta, draft.space).map((type) => h('option', { key: type, value: type }, type)),
          )),
          field(t('create.summary'), h('input', {
            className: 'jr-input',
            value: draft.summary,
            placeholder: t('create.summaryPlaceholder'),
            onChange: (event) => setDraft({ ...draft, summary: event.target.value }),
          })),
          field(t('create.description'), h('textarea', {
            className: 'jr-textarea',
            value: draft.description,
            placeholder: t('create.descriptionPlaceholder'),
            onChange: (event) => setDraft({ ...draft, description: event.target.value }),
          })),
          createError ? h('p', { className: 'jr-msg' }, createError) : null,
          h('div', { className: 'jr-actions-row' },
            h('button', { type: 'button', className: 'jr-btn jr-btn-primary', onClick: submitCreate, disabled: createBusy || !draft.summary.trim() || !draft.space },
              createBusy ? t('list.loading') : t('action.create'),
            ),
            h('button', { type: 'button', className: 'jr-btn', onClick: cancelCreate, disabled: createBusy }, t('action.cancel')),
          ),
        )
      }

      function renderMetaGrid(issue) {
        const fields = [
          [t('detail.meta.type'), issue.type || ''],
          [t('detail.meta.priority'), issue.priority || ''],
          [t('detail.meta.assignee'), issue.assignee || t('assignee.none')],
          [t('detail.meta.reporter'), issue.reporter || ''],
          [t('detail.meta.space'), issue.space || ''],
          [t('detail.meta.created'), formatWhen(issue.created, t)],
          [t('detail.meta.updated'), formatWhen(issue.updated, t)],
        ].filter((field) => Boolean(field[1]))
        return h('div', { className: 'jr-meta-grid' },
          fields.map((field) =>
            h('div', { className: 'jr-meta-item', key: field[0] },
              h('span', { className: 'jr-meta-label' }, field[0]),
              h('span', { className: 'jr-meta-value', title: field[1] }, field[1]),
            ),
          ),
        )
      }

      function renderTransitions() {
        const picker = transitions === null
          ? h('span', { className: 'jr-meta-label' }, t('list.loading'))
          : transitions.length
            ? h('select', {
                className: 'jr-select',
                value: transitionId,
                'aria-label': t('detail.changeStatus'),
                onChange: (event) => setTransitionId(event.target.value),
              },
              transitions.map((transition) => h('option', { key: String(transition.id), value: String(transition.id) },
                transition.to && transition.to !== transition.name ? `${transition.name} → ${transition.to}` : transition.name,
              )),
            )
            : h('span', { className: 'jr-meta-label' }, t('detail.noTransitions'))
        return h(React.Fragment, null,
          h('h3', { className: 'jr-section-title' }, t('detail.changeStatus')),
          h('div', { className: 'jr-actions-row' },
            picker,
            h('button', { type: 'button', className: 'jr-btn jr-btn-primary', onClick: submitTransition, disabled: transitionBusy || !transitionId },
              transitionBusy ? t('list.loading') : t('action.transition'),
            ),
          ),
          transitionsError ? h('p', { className: 'jr-msg', style: { padding: 0 } }, `${t('detail.transitionsError')} ${transitionsError}`) : null,
        )
      }

      function renderComments(comments) {
        const listOfComments = comments.length
          ? h('ul', { className: 'jr-comments' },
              comments.map((comment, index) =>
                h('li', { className: 'jr-comment', key: `${comment.created || 'comment'}-${index}` },
                  h('div', { className: 'jr-comment-head' }, h('b', null, comment.author || '—'), h('span', null, formatWhen(comment.created, t))),
                  h('p', { className: 'jr-comment-body' }, comment.body || ''),
                ),
              ),
            )
          : h('p', { className: 'jr-meta-label' }, t('detail.noComments'))
        return h(React.Fragment, null,
          h('h3', { className: 'jr-section-title' }, t('detail.comments')),
          listOfComments,
          h('label', { className: 'jr-field' },
            h('span', null, t('detail.commentPlaceholder')),
            h('textarea', {
              className: 'jr-textarea',
              value: commentDraft,
              placeholder: t('detail.commentPlaceholder'),
              onChange: (event) => setCommentDraft(event.target.value),
            }),
          ),
          h('div', { className: 'jr-actions-row' },
            h('button', { type: 'button', className: 'jr-btn jr-btn-primary', onClick: submitComment, disabled: commentBusy || !commentDraft.trim() },
              commentBusy ? t('list.loading') : t('action.comment'),
            ),
          ),
        )
      }

      function renderDetailContent() {
        if (detailLoading && !detail) {
          return h('div', { className: 'jr-state' }, h('span', { className: 'jr-spin', 'aria-hidden': true }), h('p', null, t('detail.loading')))
        }
        if (detailError) {
          return h('div', { className: 'jr-inline-error' },
            h('p', { className: 'jr-inline-error-text' }, `${t('detail.error')} ${detailError}`),
            h('button', { type: 'button', className: 'jr-btn', onClick: () => setDetailToken((value) => value + 1) }, t('action.retry')),
          )
        }
        if (!detail) return null
        return h(React.Fragment, null,
          h('p', { className: 'jr-detail-key' }, detail.key),
          h('h2', { className: 'jr-detail-title' }, detail.summary || ''),
          renderMetaGrid(detail),
          h('h3', { className: 'jr-section-title' }, t('detail.description')),
          h('p', { className: 'jr-text' }, detail.description || t('detail.noDescription')),
          renderTransitions(),
          renderComments(Array.isArray(detail.comments) ? detail.comments : []),
        )
      }

      function renderDetail() {
        return h('div', { className: 'jr-detail' },
          h('div', { className: 'jr-detail-head' },
            h('button', { type: 'button', className: 'jr-btn', onClick: closeDetail }, `← ${t('action.back')}`),
            detail ? h('span', { className: 'jr-badge', 'data-tone': statusTone(detail.statusCategory) }, detail.status || '—') : null,
            detail && detail.url ? h('a', { className: 'jr-link', href: detail.url, target: '_blank', rel: 'noreferrer' }, `${t('detail.open')} ↗`) : null,
            h('button', {
              type: 'button',
              className: 'jr-btn jr-btn-icon',
              title: t('action.refresh'),
              'aria-label': t('action.refresh'),
              onClick: () => setDetailToken((value) => value + 1),
            }, '⟳'),
          ),
          renderNoticeBar(),
          renderDetailContent(),
        )
      }

      return h('div', { className: 'jr-root', 'data-layout': inSidebar ? 'narrow' : 'wide' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        renderHeader(),
        metaError
          ? h('div', { className: 'jr-inline-error' },
              h('p', { className: 'jr-inline-error-text' }, `${t('meta.error')} ${metaError}`),
              h('button', { type: 'button', className: 'jr-btn', onClick: loadMeta }, t('action.retry')),
            )
          : null,
        !meta && !metaError
          ? h('div', { className: 'jr-state' }, h('span', { className: 'jr-spin', 'aria-hidden': true }), h('p', null, t('meta.loading')))
          : null,
        meta && !configured ? renderConfigHint() : null,
        configured ? renderFilters() : null,
        detailOpen ? null : renderNoticeBar(),
        configured
          ? h('div', { className: 'jr-body' }, creating ? renderCreateForm() : null, detailOpen && inSidebar ? renderDetail() : renderList())
          : null,
        detailOpen && !inSidebar
          ? h(React.Fragment, null,
              h('button', { type: 'button', className: 'jr-scrim', 'aria-label': t('action.back'), onClick: closeDetail }),
              h('div', { className: 'jr-drawer', role: 'dialog', 'aria-label': t('detail.dialog') }, renderDetail()),
            )
          : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposers = []
          disposers.push(ctx.locale.register(NS, 'en', EN))
          disposers.push(ctx.locale.register(NS, 'fr', FR))
          return () => disposeAll(disposers)
        }, 'dsh-jira: dictionaries')

        const t = ctx.locale.bind(NS)

        ctx.effect(() => {
          const disposers = []
          disposers.push(
            ctx.slots.inject('sidebar.panellist', () =>
              ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_KIND, order: 30, label: () => t('nav.label') }, SidebarIcon),
            ),
          )
          disposers.push(
            ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_KIND }, () => h(Panel, { t }))),
          )
          return () => disposeAll(disposers)
        }, 'dsh-jira: panels')

        // The right side panel registers the same view as a tab type, so it shows
        // up in the panel's tools list and can be docked or floated there.
        ctx.inject(['sidebarRightTabs'], (scope) => {
          scope.effect(() => {
            const disposers = []
            disposers.push(
              scope.sidebarRightTabs.register({
                id: TAB_TYPE_ID,
                kind: PANEL_KIND,
                title: () => t('nav.label'),
                guide: [
                  {
                    id: PANEL_KIND,
                    order: 50,
                    title: () => t('nav.label'),
                    description: () => t('guide.description'),
                    icon: GuideArtwork,
                  },
                ],
              }),
            )
            disposers.push(
              scope.slots.inject('sidebar.right.pane.tab', () =>
                scope.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_TYPE_ID, locale: NS }, () => h(Panel, { t, inSidebar: true })),
              ),
            )
            return () => disposeAll(disposers)
          }, 'dsh-jira: side panel type')
        })
      },
    }
  },
})
