'use strict';
// Bump with every release; the site's version.json carries the same number so open copies can tell.
const APP_VERSION = 315;
/* ---------- storage ---------- */
// A shared copy (its page carries <meta name="channel" content="share">) keeps its own data and its
// own update rules, so opening it on your phone can never touch your budget.
const CHANNEL = (document.querySelector('meta[name="channel"]') || {}).content || 'main';
const KEY = CHANNEL === 'main' ? 'budget-app-v2' : 'budget-app-v2-' + CHANNEL;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
