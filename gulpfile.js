'use strict';
var gulp = require('gulp');
var path = require('path');
var del = require('del');
// var hugoBin = require('hugo-bin');
// To parse arguments passed to gulp tasks
var argv = require('yargs').argv;
// To start hugo build from gulp task
var cp = require('child_process');
// Initializing browserSync instance
const browserSync = require('browser-sync').create();
// Including gulp plugins
var gp = require('gulp-load-plugins')({
  pattern: ['gulp-*', 'gulp.*'], //, 'main-bower-files'
  replaceString: /\bgulp[\-.]/
});
// Helps to execute tasks one by one
var gTasks = gp.sync(gulp);
// Environment definition
var dev = gp.environments.development;
var prod = gp.environments.production;
// Default should be production environment
gp.environments.current(prod);

// Configuring paths
gulp.paths = {};
// http://stackoverflow.com/questions/28538918/pass-parameter-to-gulp-task
gulp.paths.dist = path.join(__dirname, 'dist');
gulp.paths.dest = argv.destination ? argv.destination : './site/static';
gulp.paths.data = argv.data ? argv.data : argv.destination ? argv.destination : './site/data';
gulp.paths.js = path.join(gulp.paths.dest, 'js');
gulp.paths.css = path.join(gulp.paths.dest, 'css');
gulp.paths.img = path.join(gulp.paths.dest, 'img');
gulp.paths.font = path.join(gulp.paths.dest, 'fonts');

// Hugo config
const hugoBin = './hugo/hugo.exe';
const defaultArgs = ['--destination', gulp.paths.dist, '-s', 'site', '-v'];
// Netlify config
const netlify = 'netlify';

// Options for generating asset manifest after revision
var manifestOptions = {
  merge: true
  , base: gulp.paths.data
};
// The location where asset manifes file will be stored
var manifestPath = path.join(__dirname, gulp.paths.data, 'assets.json');
// Method is used to correct CSS urls according to asset manifest
// After build and asset revision, filenames and locations will be changed,
// so it is necessary to change urls in CSS accordingly
var correctCssUrls = (img, fonts, urlToCorrect) => {
  let url = urlToCorrect;
  // The name of the file method is working
  let fileName = '';
  // The stuff added after filename, like icomoon.woff?fileSuffix or icomoon.woff#fileSuffix
  let fileSuffix = '';
  // To preserv the suffix, we should remember the separator it used. Can be '?' or '#'
  let fileSuffixSeparator = '';
  // http://stackoverflow.com/a/1789952/4284093
  // Using bitwise inverse (~) 
  if (~url.indexOf('/')) {
    // Information about asset names after revision
    let assetManifest = require(manifestPath);
    // Finding filename without path to it
    let urlParts = url.split('/');
    let lastEntry = urlParts.length - 1;
    fileName = urlParts[lastEntry];
    if (~url.indexOf('?')) {
      fileSuffixSeparator = '?';
      let fileNameParts = fileName.split(fileSuffixSeparator);
      fileName = fileNameParts[0];
      // There should not be more then 1 '?' in the filename
      fileSuffix = fileNameParts[1];
    }
    else if (~url.indexOf('#')) {
      fileSuffixSeparator = '#';
      let fileNameParts = fileName.split(fileSuffixSeparator);
      fileName = fileNameParts[0];
      // There should not be more then 1 '#' in the filename
      fileSuffix = fileNameParts[1];
    }
    // If we have revisioned the file, changing its name to the new one
    fileName = assetManifest[fileName] ? assetManifest[fileName] : fileName;
    // Appending original suffix. It can be important in some cases
    fileName += fileSuffix ? fileSuffixSeparator + fileSuffix : '';
  }
  else { fileName = url; }
  // If we are dealing with font, then prependint base font location 
  if ((~url.indexOf('font') && !(~url.indexOf('.css')) && !(~url.indexOf('.js')))
    || ~url.indexOf('.eot')
    || ~url.indexOf('.ttf')
    || ~url.indexOf('.woff')
    || ~url.indexOf('.woff2')
    || ~url.indexOf('.svg'))
  { return fonts + fileName; }
  // Otherwise we are dealing with image and prepending base image location
  return img + fileName;
};
// Method to build site with Hugo
var buildSite = (cb, options, environment = "development") => {
  // Fetching arguments to pass to Hugo
  const args = options ? defaultArgs.concat(options) : defaultArgs;

  process.env.NODE_ENV = environment;

  // Starting hugo.exe
  return cp.spawn(hugoBin, args, { stdio: 'inherit' }).on('close', (code) => {
    if (code === 0) {
      // On success reloading website if it is running
      browserSync.reload();
      // Docs for cb() https://github.com/gulpjs/gulp/blob/master/docs/recipes/running-tasks-in-series.md
      cb();
    }
    else {
      browserSync.notify('Hugo build failed :(');
      cb('Hugo build failed');
    }
  });
}

var deployToNetlify = (cb, options) => {
  // const args = options ? netlifyArgs.concat(options) : netlifyArgs;
  var netlifyDeployCmd = 'netlify deploy -p ' + gulp.paths.dist;
  console.log('Running ' + netlifyDeployCmd);

  cp.exec(netlifyDeployCmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Netlify error: ${error}`);
      cb(error);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
    cb();
  });
}


gulp.task('netlify-cms', () => {
  return gulp.src(['./src/admin/**'])
  .pipe(gulp.dest('./site/static/admin'));
  // gulp.src("./node_modules/netlify-cms/dist/*.{woff,eot,woff2,ttf,svg,png}")
  //   .pipe(gulp.dest("./dist/css"));
});
// Hugo build tasks
gulp.task('hugo', ['assets'], (cb) => buildSite(cb));
gulp.task('hugo-preview', gTasks.sync(['dev', 'assets']), (cb) => buildSite(cb, ['--buildDrafts', '--buildFuture']));
// Hugo build with production configuration
gulp.task('hugo-prod', ['assets'], (cb) => buildSite(cb, [], 'production'));
// '--config', path.join(__dirname, 'site/config.prod.toml')
// There are a lot task for building assets, but here I'm specifying only one (vendor-css),
// because they are executed sequentially (each of them depend on another one by one). 
// This is necessary due to revision manifest file.
// Due to async nature of gulp tasks, they all tried to write to the same file and some of tasks failed to do so,
// so I've been getting wrong manifest which lacked some files.
// Sould try https://www.npmjs.com/package/gulp-sync sometime
gulp.task('assets', gTasks.sync(['styles', 'scripts']));
// Some task aliasing
gulp.task('build', ['hugo']);
gulp.task('build-preview', ['hugo-preview']);
gulp.task('release', gTasks.sync(['hugo-prod', 'html', 'netlify-cms']));

gulp.task('deploy', ['release']);
// Simple task to revision and copy site images to destination directory
gulp.task('images', ['json'], () => {
  return gulp.src([
    './src/img/**/*'
  ])
    // .pipe(gp.filter('**/*.{jpg,jpeg,svg,png,ico,gif}'))
    // .pipe(gp.flatten())
    .pipe(prod(gp.imagemin()))
    .pipe(gp.rev(manifestPath))
    .pipe(gulp.dest(gulp.paths.img))
    .pipe(gp.rev.manifest(manifestPath, manifestOptions))
    .pipe(gulp.dest(gulp.paths.data));
});

gulp.task('json', () => {
  return gulp.src('.src/img/**/**.json')
  .pipe(gp.rev(manifestPath))
  .pipe(gulp.dest(gulp.paths.img))
  .pipe(gp.rev.manifest(manifestPath, manifestOptions))  
  .pipe(gulp.dest(gulp.paths.data))
  ;
});

// Simple task to revision and copy font files to destination directory
gulp.task('fonts', function () {
  return gulp.src([
    './src/fonts/**/*'
  ])
    .pipe(gp.filter('**/*.{eot,otf,svg,ttf,woff,woff2}'))
    .pipe(gp.flatten())
    .pipe(gp.rev(manifestPath))
    .pipe(gulp.dest(gulp.paths.font))
    .pipe(gp.rev.manifest(manifestPath, manifestOptions))
    .pipe(gulp.dest(gulp.paths.data))
    ;
});
// Task to bundle site styles
// It is necessary, that it is executed after asset tasks, 
// because it is using manifest information to change CSS urls
gulp.task('styles', ['images', 'fonts'], () => {
  return gulp.src('./src/css/**/*.css')
    .pipe(prod(gp.cleanCss({
      keepSpecialComments: 0
    })))
    .pipe(gp.modifyCssUrls({
      modify: (url, filePath) => {
        return correctCssUrls('/img/', '/fonts/', url);
      }
    }))
    // .pipe(prod(gp.cleanCss({
    //   keepSpecialComments: 0
    // })))
    // .pipe(gp.concat('styles.css'))
    .pipe(gp.rev(manifestPath))
    .pipe(gulp.dest(gulp.paths.css))
    .pipe(browserSync.stream())
    .pipe(gp.rev.manifest(manifestPath, manifestOptions))
    .pipe(gulp.dest(gulp.paths.data))
    ;
});
// Task to bundle site scripts
gulp.task('scripts', () => {
  return gulp.src('./src/js/**/*.js')
    // .pipe(gp.concat('scripts.js'))
    // Minifying js only in production
    // .pipe(prod(gp.uglify()))
    .pipe(gp.rev(manifestPath))
    .pipe(gulp.dest(gulp.paths.js))
    .pipe(browserSync.stream())
    .pipe(gp.rev.manifest(manifestPath, manifestOptions))
    .pipe(gulp.dest(gulp.paths.data))
    ;
});
// Task for cleaning compiled files.
// Due to revisioning the name of the files changes with every change to it,
// so we can end up with a lot of old files which will not be overwritten.
gulp.task('clean', () => {
  del([
    manifestPath
    , './dist/**'
    , path.join(gulp.paths.dest, '**', '*')
    , './site/public/**'
    , '!' + path.join(gulp.paths.dest, '.keep')
  ])
    .then(paths => {
      console.log('Deleted files and folders:\n', paths.join('\n'));
    });
});
// Task to optimize HTML after Hugo do its job.
// Hugo leaves a lot of white spaces and overall produce not very optimized HTML
// This task meant to fix that
gulp.task('html', () => {
  // Finding the path to site folder, where we should perform html optimizations
  var location = argv.folder ? argv.folder : gulp.paths.dist;
  // Looking for all html files
  location = path.join(location, '**', '*.html');
  // Telling the user about used location
  console.log('Optimizing: ' + location);
  // Specifying base directory to change files in place
  return gulp.src(location, { base: "./" })
    // Performing optimizations
    .pipe(gp.htmlmin({ collapseWhitespace: true }))
    // Saving the result
    .pipe(gulp.dest('./'))
});
// Task to run browserSync server for compiled site
gulp.task('serv', () => {
  browserSync.init({
    server: {
      baseDir: './site/public'
    }
  });
  // gulp.watch('./src/js/**/*.js', ['app-js']);
  // gulp.watch('./src/css/**/*.css', ['app-css']);
  // gulp.watch('./site/**/*', ['hugo']);
});
gulp.task('server', ['hugo-preview'], () => {
  browserSync.init({
    server: {
      baseDir: './dist'
    }
  });
});
// Task to set environment to development
gulp.task('dev', dev.task);
