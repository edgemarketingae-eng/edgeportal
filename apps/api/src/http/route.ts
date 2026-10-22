import type { RouteDef } from "@edge/contracts";
import type { NextFunction, Request, RequestHandler, Response, Router } from "express";
import type { z } from "zod";

type Out<T> = T extends z.ZodType ? z.output<T> : undefined;
export type Valid<D extends RouteDef> = { params: Out<NonNullable<D["params"]>>; query: Out<NonNullable<D["query"]>>; body: Out<NonNullable<D["body"]>> };
type Handler<D extends RouteDef> = (req: Omit<Request, "valid"> & { valid: Valid<D> }, res: Response) => Promise<z.input<D["response"]> | void>;

/**
 * Registers a contract route: validates params/query/body with the shared Zod schemas
 * (Express 5's req.query is read-only, so results live on req.valid) and sends JSON.
 */
export function register<D extends RouteDef>(router: Router, def: D, ...handlers: [...RequestHandler[], Handler<D>]) {
  const handler = handlers.pop() as Handler<D>;
  const middleware = handlers as RequestHandler[];
  const method = def.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
  router[method](def.path, ...middleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.valid = {
        params: def.params ? def.params.parse(req.params) : undefined,
        query: def.query ? def.query.parse(req.query) : undefined,
        body: def.body ? def.body.parse(req.body ?? {}) : undefined,
      };
      const out = await handler(req as never, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (e) {
      next(e);
    }
  });
}
