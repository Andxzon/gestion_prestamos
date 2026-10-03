import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { connectionMonitor } from '../lib/connectionMonitor';
import { countPending } from '../lib/offlineQueue';
import { syncNow } from '../lib/syncManager';

export const SyncStatusIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(connectionMonitor.isOnline);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const updatePendingCount = async () => {
    const count = await countPending();
    setPendingCount(count);
  };

  useEffect(() => {
    // Estado inicial
    updatePendingCount();

    // Listeners
    const unsubscribe = connectionMonitor.onChange((online) => {
      setIsOnline(online);
      if (online) updatePendingCount();
    });

    const handleSyncStart = () => setIsSyncing(true);
    const handleSyncEnd = () => {
      setIsSyncing(false);
      updatePendingCount();
    };
    
    const handleOperationQueued = () => {
      updatePendingCount();
    };

    window.addEventListener('sync-start', handleSyncStart);
    window.addEventListener('sync-end', handleSyncEnd);
    window.addEventListener('offline-operation-queued', handleOperationQueued);

    // Intervalo de respaldo para actualizar el contador si estamos offline y el usuario navega
    const intervalId = setInterval(updatePendingCount, 5000);

    return () => {
      unsubscribe();
      window.removeEventListener('sync-start', handleSyncStart);
      window.removeEventListener('sync-end', handleSyncEnd);
      window.removeEventListener('offline-operation-queued', handleOperationQueued);
      clearInterval(intervalId);
    };
  }, []);

  const handleManualSync = () => {
    syncNow();
  };

  // Si no hay nada pendiente y estamos online, podemos no mostrar nada o un check pequeño
  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null; // Omitir para no estorbar en UI limpia
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: isOnline ? (isSyncing ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)') : 'rgba(239, 68, 68, 0.15)',
        color: isOnline ? (isSyncing ? '#60a5fa' : '#34d399') : '#f87171',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '0.85rem',
        fontWeight: 500,
        border: `1px solid ${isOnline ? (isSyncing ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)') : 'rgba(239, 68, 68, 0.3)'}`,
        transition: 'all 0.3s ease'
      }}
    >
      {!isOnline ? (
        <>
          <CloudOff size={16} />
          <span>Sin conexión ({pendingCount} pendientes)</span>
        </>
      ) : isSyncing ? (
        <>
          <RefreshCw size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
          <span>Sincronizando ({pendingCount})...</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <AlertCircle size={16} />
          <span>{pendingCount} pendientes</span>
          <button 
            onClick={handleManualSync}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              textDecoration: 'underline',
              cursor: 'pointer',
              marginLeft: '4px',
              padding: 0,
              font: 'inherit'
            }}
          >
            Sincronizar
          </button>
        </>
      ) : (
        <>
          <CheckCircle size={16} />
          <span>Sincronizado</span>
        </>
      )}
    </div>
  );
};

export default SyncStatusIndicator;
