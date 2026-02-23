import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { kaizenRouter } from "./kaizen";
import { kamishibaiRouter } from "./kamishibai";

export const melhoriaContinuaRouter: ExpressRouter = Router();

melhoriaContinuaRouter.use("/kaizens", kaizenRouter);
melhoriaContinuaRouter.use("/kamishibai", kamishibaiRouter);
