# Bacon Templates

## An asynchronous template engine for nodejs.

Bacon templates have a similar syntax to the now deprecated
jQuery Templates project.  If you have a project that currently
uses jQuery templates, it should be a simple port to bacon 
templates.   

There are some differences though that you should be aware of.

Bacon templates have a more limited set of operators than are
allowed in jQuery templates.

* assignment operations are not allowed.
* bitwise operations are not allowed.  
* the 'new' operator is not allowed.
* functions may not be defined within templates.

Bacon templates are parsed to an AST and are interpreted during
template rendering. 

Promises and asynchronous functions can be used freely anywhere
within bacon template expressions.

Bacon templates try to provide good error information so you can 
quickly resolve problems in your templates.

## Using with Express

To use bacon templates within Express 3.x within your app.configure
replace the app.set('view engine', ..) line with the following:

```javascript
  app.set('view engine', 'html');
  app.engine(".html", require("bacon-templates").express);
```




