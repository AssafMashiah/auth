import { Context, Next } from 'hono';
import type { Env, Variables } from '../types';
import { jwtService } from '../services/jwt-service';
import { projectService } from '../services/project-service';
import { userService } from '../services/user-service';
import { AuthenticationError } from '../utils/errors';

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user to context
 */
export async function authMiddleware(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
  const authHeader = c.req.header('Authorization') || null;
  const token = jwtService.extractTokenFromHeader(authHeader);

  if (!token) {
    throw new AuthenticationError('No token provided');
  }

  // Get project ID from route params
  const projectId = c.req.param('projectId');
  if (!projectId) {
    throw new AuthenticationError('Project ID required');
  }

  // Get project
  const project = await projectService.getProject(c.env, projectId);
  if (!project) {
    throw new AuthenticationError('Project not found');
  }

  // Verify token
  const payload = await jwtService.verifyAccessToken(token, project.jwtSecret, project.jwtAlgorithm);

  // Get user
  const user = await userService.getUserById(c.env, project.userTableName, payload.sub);
  if (!user) {
    throw new AuthenticationError('User not found');
  }

  // Attach user and project to context
  c.set('user', user);
  c.set('project', project);
  c.set('jwtPayload', payload);

  await next();
}

/**
 * Optional auth middleware - doesn't throw if no token
 */
export async function optionalAuthMiddleware(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
  try {
    await authMiddleware(c, next);
  } catch (error) {
    // Continue without auth
    await next();
  }
}