// Tests run as APP_ENV=test unless the caller says otherwise. The API loads the
// repo-root .env itself; real environment variables win over it.
process.env["APP_ENV"] ??= "test";
