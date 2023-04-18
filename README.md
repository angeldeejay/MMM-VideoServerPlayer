# MMM-VideoServerPlayer

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/).

## Using the module

To use this module, add the following configuration block to the modules array in the `config/config.js` file:

```js
var config = {
  modules: [
    {
      module: "MMM-VideoServerPlayer",
      config: {
        videos: [...] // video list
        height: 350, // video player height
        width: 700, // video player width
      }
    }
  ]
};
```

## Configuration options

| Option   | Default | Description                    |
| -------- | ------- | ------------------------------ |
| `height` | `350`   | _Optional_ video player height |
| `width`  | `700`   | _Optional_ video player width  |
| `videos` | `[]`    | _Required_ video list          |
