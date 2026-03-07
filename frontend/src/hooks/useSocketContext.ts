import { useContext } from 'react';
import SocketContext from '../contexts/SocketContext';

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}

/** Hook that can be used outside provider (returns null if not in provider) */
export function useSocketOptional() {
  return useContext(SocketContext);
}
