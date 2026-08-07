const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronSync', {
  getTasks: function() {
    return ipcRenderer.sendSync('get-tasks');
  },
  triggerSync: function() {
    return ipcRenderer.invoke('trigger-sync');
  },
  onUpdate: function(callback) {
    ipcRenderer.on('tasks-updated', function(event, data) {
      callback(data);
    });
  },
  onSyncStatus: function(callback) {
    ipcRenderer.on('sync-status', function(event, data) {
      callback(data);
    });
  }
});
