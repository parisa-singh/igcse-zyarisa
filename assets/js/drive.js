/* drive.js — OPTIONAL Google Drive integration for the tracker.
 * Uses Google Identity Services (token flow) + the Drive REST API v3.
 * Nothing here runs unless the user sets up a Client ID and clicks Connect.
 *
 * The user follows an in-app setup once (console.cloud.google.com → enable Drive API →
 * OAuth Client ID → add this site as an authorized JS origin → paste the Client ID).
 * Client ID is stored in localStorage 'igcse-drive-client-id'.
 *
 * Files are saved as JSON into a Drive folder named "IGCSE Tracker".
 * Scope drive.file = access only to files this app creates. Least-privilege by design.
 *
 * Exposes window.Drive:
 *   Drive.getClientId() / setClientId(id) / clearClientId()
 *   Drive.isConnected()
 *   Drive.connect()                  -> Promise (opens Google consent)
 *   Drive.saveFile(name, dataObj)    -> Promise<fileId>
 *   Drive.listFiles()                -> Promise<[{id,name,modifiedTime}]>
 *   Drive.loadFile(fileId)           -> Promise<object>
 *   Drive.onStatus(cb)               -> subscribe to 'disconnected'|'ready'|'connected'
 */
(function () {
  'use strict';

  var GIS_SRC = 'https://accounts.google.com/gsi/client';
  var SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var FOLDER_NAME = 'IGCSE Tracker';
  var CID_KEY = 'igcse-drive-client-id';

  var tokenClient = null;
  var accessToken = null;
  var gisLoaded = false;
  var statusCbs = [];

  function emit(s) { statusCbs.forEach(function (cb) { try { cb(s); } catch (e) {} }); }
  function onStatus(cb) { statusCbs.push(cb); }

  function getClientId() { return localStorage.getItem(CID_KEY) || ''; }
  function setClientId(id) { localStorage.setItem(CID_KEY, String(id).trim()); emit('ready'); }
  function clearClientId() { localStorage.removeItem(CID_KEY); accessToken = null; tokenClient = null; emit('disconnected'); }
  function isConnected() { return !!accessToken; }

  /* Dynamically load the Google Identity Services script once. */
  function loadGIS() {
    return new Promise(function (resolve, reject) {
      if (gisLoaded && window.google && google.accounts) return resolve();
      var existing = document.querySelector('script[data-gis]');
      if (existing) { existing.addEventListener('load', function () { gisLoaded = true; resolve(); }); return; }
      var s = document.createElement('script');
      s.src = GIS_SRC; s.async = true; s.defer = true; s.setAttribute('data-gis', '1');
      s.onload = function () { gisLoaded = true; resolve(); };
      s.onerror = function () { reject(new Error('Could not load Google Identity Services. Check your connection.')); };
      document.head.appendChild(s);
    });
  }

  /* Open the Google consent screen and obtain an access token. */
  function connect() {
    var clientId = getClientId();
    if (!clientId) return Promise.reject(new Error('No Client ID set. Run the Drive setup first.'));
    return loadGIS().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPE,
            callback: function (resp) {
              if (resp && resp.access_token) { accessToken = resp.access_token; emit('connected'); resolve(accessToken); }
              else { reject(new Error('Authorization failed or was cancelled.')); }
            },
            error_callback: function (err) { reject(new Error((err && err.message) || 'Authorization was cancelled.')); }
          });
          tokenClient.requestAccessToken({ prompt: '' });
        } catch (e) { reject(e); }
      });
    });
  }

  function ensureToken() {
    return accessToken ? Promise.resolve(accessToken) : connect();
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers.Authorization = 'Bearer ' + accessToken;
    return fetch('https://www.googleapis.com/' + path, opts).then(function (r) {
      if (r.status === 401) { accessToken = null; throw new Error('Session expired — reconnect to Drive.'); }
      if (!r.ok) return r.text().then(function (t) { throw new Error('Drive API error ' + r.status + ': ' + t); });
      return r.json();
    });
  }

  /* Find or create the "IGCSE Tracker" folder, return its id. */
  function getFolderId() {
    var q = encodeURIComponent("name='" + FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    return api('drive/v3/files?q=' + q + '&fields=files(id,name)').then(function (res) {
      if (res.files && res.files.length) return res.files[0].id;
      return api('drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
      }).then(function (f) { return f.id; });
    });
  }

  /* Save (create or overwrite by name) a JSON file in the folder. */
  function saveFile(name, dataObj) {
    return ensureToken().then(getFolderId).then(function (folderId) {
      var content = JSON.stringify(dataObj, null, 2);
      // Look for an existing file of the same name in the folder.
      var q = encodeURIComponent("name='" + name + "' and '" + folderId + "' in parents and trashed=false");
      return api('drive/v3/files?q=' + q + '&fields=files(id,name)').then(function (res) {
        var existingId = res.files && res.files.length ? res.files[0].id : null;
        var metadata = existingId ? {} : { name: name, parents: [folderId] };
        var boundary = 'igcse' + '1234567890';
        var body =
          '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) + '\r\n' +
          '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
          content + '\r\n' +
          '--' + boundary + '--';
        var method = existingId ? 'PATCH' : 'POST';
        var url = 'upload/drive/v3/files' + (existingId ? '/' + existingId : '') + '?uploadType=multipart&fields=id,name';
        return api(url, {
          method: method,
          headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
          body: body
        }).then(function (f) { return f.id; });
      });
    });
  }

  /* List tracker JSON files in the folder. */
  function listFiles() {
    return ensureToken().then(getFolderId).then(function (folderId) {
      var q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
      return api('drive/v3/files?q=' + q + '&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)')
        .then(function (res) { return res.files || []; });
    });
  }

  /* Download and parse a file's JSON content. */
  function loadFile(fileId) {
    return ensureToken().then(function () {
      return fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
        headers: { Authorization: 'Bearer ' + accessToken }
      }).then(function (r) {
        if (!r.ok) throw new Error('Could not download file (' + r.status + ').');
        return r.json();
      });
    });
  }

  window.Drive = {
    getClientId: getClientId,
    setClientId: setClientId,
    clearClientId: clearClientId,
    isConnected: isConnected,
    connect: connect,
    saveFile: saveFile,
    listFiles: listFiles,
    loadFile: loadFile,
    onStatus: onStatus,
    FOLDER_NAME: FOLDER_NAME
  };
})();
