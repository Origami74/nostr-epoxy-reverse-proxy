import debug from "debug";

// enable logging
if (!debug.enabled("NERP")) {
  debug.enable("NERP,NERP:*");
}

const logger = debug("NERP");

export default logger;
