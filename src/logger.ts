import debug from "debug";
import "./env.js";

// enable logging
if (!debug.enabled("NERP")) {
  debug.enable("NERP,NERP:*");
}

const logger = debug("NERP");

export default logger;
