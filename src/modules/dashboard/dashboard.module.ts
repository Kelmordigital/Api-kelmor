import { db } from '../../database/client';
import { DashboardQueries, type ActivityAnalytics, type FinanceAnalytics, type PlatformStats, type SalesAnalytics } from './dashboard.queries';
import { DashboardController } from './dashboard.controller';
import { CustomerValueQueries } from './customer-value.queries';
import { DashboardRouter } from './dashboard.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const queries = new DashboardQueries(db);

export const salesAnalytics: SalesAnalytics = queries;
export const activityAnalytics: ActivityAnalytics = queries;
export const financeAnalytics: FinanceAnalytics = queries;
export const platformStats: PlatformStats = queries;

export const dashboardRouter = new DashboardRouter(
    new DashboardController(salesAnalytics, activityAnalytics, financeAnalytics, platformStats, new CustomerValueQueries(db)),
);
