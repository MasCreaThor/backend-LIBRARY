import React from 'react';

// Importar nuestro componente principal de gestión de préstamos
import { LoanManagement } from '@/components/loan';

// Importar layout si existe (adaptar según la estructura del proyecto)
// import { DashboardLayout } from '@/components/layout';
// import { AuthenticatedRoute } from '@/components/auth';

/**
 * Página principal de gestión de préstamos
 * Ubicación: src/app/loans/page.tsx
 * 
 * Esta página integra todo el sistema de préstamos implementado:
 * - Gestión completa de préstamos
 * - Sistema de devoluciones
 * - Préstamos vencidos
 * - Dashboard de estadísticas
 */
export default function LoansPage() {
  return (
    // Si tienes AuthenticatedRoute, descoméntalo
    // <AuthenticatedRoute>
      // Si tienes DashboardLayout, descoméntalo y adapta
      // <DashboardLayout>
        <div className="min-h-screen bg-gray-50">
          {/* 
            Nuestro componente LoanManagement incluye:
            - Header con navegación por tabs
            - Lista de préstamos con filtros
            - Sistema de devoluciones
            - Gestión de préstamos vencidos  
            - Dashboard de estadísticas
            - Modal de crear préstamos
            - Todas las validaciones y hooks
          */}
          <LoanManagement />
        </div>
      // </DashboardLayout>
    // </AuthenticatedRoute>
  );
}

/**
 * NOTA IMPORTANTE:

 * El componente LoanManagement es completamente autónomo y incluye:
 * ✅ Todo el sistema de gestión
 * ✅ Navegación interna por tabs
 * ✅ Estados de carga y errores
 * ✅ Responsive design
 * ✅ Todas las funcionalidades implementadas
 */