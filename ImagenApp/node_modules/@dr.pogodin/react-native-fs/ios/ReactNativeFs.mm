#import "ReactNativeFs.h"

#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#import "NSArray+Map.h"
#import "Downloader.h"
#import "Uploader.h"

#import <React/RCTEventDispatcher.h>
#import <React/RCTUtils.h>

#if __has_include(<React/RCTImageLoader.h>)
#import <React/RCTImageLoader.h>
#else
#import <React/RCTImageLoaderProtocol.h>
#endif

#import <CommonCrypto/CommonDigest.h>
#import <Photos/Photos.h>

#import "RNFSException.h"

typedef void (^CompletionHandler)(void);

@implementation ReactNativeFs
static NSMutableDictionary *completionHandlers;
NSMutableDictionary<NSValue*,NSArray*> *pendingPickFilePromises;

RCT_EXPORT_MODULE()

- (instancetype) init
{
  pendingPickFilePromises = [NSMutableDictionary dictionaryWithCapacity:1];
  return [super init];
}

RCT_EXPORT_METHOD(readDir:(NSString *)dirPath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSFileManager *fileManager = [NSFileManager defaultManager];
  NSError *error = nil;

  NSArray *contents = [fileManager contentsOfDirectoryAtPath:dirPath error:&error];
  NSMutableArray *tagetContents = [[NSMutableArray alloc] init];
  for (NSString *obj in contents) {
    NSString *path = [dirPath stringByAppendingPathComponent:obj];
    NSDictionary *attributes = [fileManager attributesOfItemAtPath:path error:nil];
    if(attributes != nil) {
        [tagetContents addObject:@{
            @"ctime": [self dateToTimeIntervalNumber:(NSDate *)[attributes objectForKey:NSFileCreationDate]],
            @"mtime": [self dateToTimeIntervalNumber:(NSDate *)[attributes objectForKey:NSFileModificationDate]],
            @"name": obj,
            @"path": path,
            @"size": [attributes objectForKey:NSFileSize],
            @"type": [attributes objectForKey:NSFileType]
            }];
    }
  }

  if (error) {
    return [self reject:reject withError:error];
  }

  resolve(tagetContents);
}

RCT_EXPORT_METHOD(exists:(NSString *)filepath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(__unused RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:filepath];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try {
    BOOL fileExists = [[NSFileManager defaultManager] fileExistsAtPath:filepath];
    resolve([NSNumber numberWithBool:fileExists]);
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}

RCT_EXPORT_METHOD(stat:(NSString *)filepath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:filepath];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try {
    NSError *error = nil;
    NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:filepath error:&error];

    if (error) {
      return [self reject:reject withError:error];
    }

    attributes = @{
                   @"ctime": [self dateToTimeIntervalNumber:(NSDate *)[attributes objectForKey:NSFileCreationDate]],
                   @"mtime": [self dateToTimeIntervalNumber:(NSDate *)[attributes objectForKey:NSFileModificationDate]],
                   @"size": [attributes objectForKey:NSFileSize],
                   @"type": [attributes objectForKey:NSFileType],
                   @"mode": @([[NSString stringWithFormat:@"%ld", (long)[(NSNumber *)[attributes objectForKey:NSFilePosixPermissions] integerValue]] integerValue]),
                   @"originalFilepath": @"NOT_SUPPORTED_ON_IOS"
                   };

    resolve(attributes);
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}

RCT_EXPORT_METHOD(writeFile:(NSString *)filepath
                  b64:(NSString *)base64Content
                  options:(JS::NativeReactNativeFs::FileOptionsT &)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Content options:NSDataBase64DecodingIgnoreUnknownCharacters];

  NSMutableDictionary *attributes = [[NSMutableDictionary alloc] init];

  if (options.NSFileProtectionKey() != nil) {
    [attributes setValue:options.NSFileProtectionKey() forKey:@"NSFileProtectionKey"];
  }

  BOOL success = [[NSFileManager defaultManager] createFileAtPath:filepath contents:data attributes:attributes];

  if (!success) {
    return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
  }

  return resolve(nil);
}

RCT_EXPORT_METHOD(appendFile:(NSString *)filepath
                  b64:(NSString *)b64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:filepath];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:b64 options:NSDataBase64DecodingIgnoreUnknownCharacters];

    NSFileManager *fM = [NSFileManager defaultManager];

    if (![fM fileExistsAtPath:filepath])
    {
      BOOL success = [[NSFileManager defaultManager] createFileAtPath:filepath contents:data attributes:nil];

      if (!success) {
        return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
      } else {
        return resolve(nil);
      }
    }

    @try {
      NSFileHandle *fH = [NSFileHandle fileHandleForUpdatingAtPath:filepath];

      [fH seekToEndOfFile];
      [fH writeData:data];

      return resolve(nil);
    } @catch (NSException *exception) {
      NSMutableDictionary * info = [NSMutableDictionary dictionary];
      [info setValue:exception.name forKey:@"ExceptionName"];
      [info setValue:exception.reason forKey:@"ExceptionReason"];
      [info setValue:exception.callStackReturnAddresses forKey:@"ExceptionCallStackReturnAddresses"];
      [info setValue:exception.callStackSymbols forKey:@"ExceptionCallStackSymbols"];
      [info setValue:exception.userInfo forKey:@"ExceptionUserInfo"];
      NSError *err = [NSError errorWithDomain:@"RNFS" code:0 userInfo:info];
      return [self reject:reject withError:err];
    }
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}

RCT_EXPORT_METHOD(write:(NSString *)filepath
                  b64:(NSString *)b64
                  position:(double)position
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSData *data = [[NSData alloc] initWithBase64EncodedString:b64 options:NSDataBase64DecodingIgnoreUnknownCharacters];

  NSFileManager *fM = [NSFileManager defaultManager];

  if (![fM fileExistsAtPath:filepath])
  {
    BOOL success = [[NSFileManager defaultManager] createFileAtPath:filepath contents:data attributes:nil];

    if (!success) {
      return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
    } else {
      return resolve(nil);
    }
  }

  @try {
    NSFileHandle *fH = [NSFileHandle fileHandleForUpdatingAtPath:filepath];

    if (position >= 0) {
      [fH seekToFileOffset:position];
    } else {
      [fH seekToEndOfFile];
    }
    [fH writeData:data];

    return resolve(nil);
  } @catch (NSException *e) {
    return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: error writing file: '%@'", filepath], nil);
  }
}

RCT_EXPORT_METHOD(unlink:(NSString*)filepath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:filepath];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try {
    NSFileManager *manager = [NSFileManager defaultManager];
    BOOL exists = [manager fileExistsAtPath:filepath isDirectory:NULL];

    if (!exists) {
      return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
    }

    NSError *error = nil;
    BOOL success = [manager removeItemAtPath:filepath error:&error];

    if (!success) {
      return [self reject:reject withError:error];
    }

    resolve(nil);
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}

RCT_EXPORT_METHOD(mkdir:(NSString *)filepath
                  options:(JS::NativeReactNativeFs::MkdirOptionsT &)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSFileManager *manager = [NSFileManager defaultManager];

  NSMutableDictionary *attributes = [[NSMutableDictionary alloc] init];

  if (options.NSFileProtectionKey() != nil) {
      [attributes setValue:options.NSFileProtectionKey() forKey:@"NSFileProtectionKey"];
  }

  NSError *error = nil;
    BOOL success = [manager createDirectoryAtPath:filepath withIntermediateDirectories:YES attributes:attributes error:&error];

  if (!success) {
    return [self reject:reject withError:error];
  }

  NSURL *url = [NSURL fileURLWithPath:filepath];

  if (options.NSURLIsExcludedFromBackupKey().has_value()) {
    NSNumber *value = [NSNumber numberWithBool:*options.NSURLIsExcludedFromBackupKey()];
    success = [url setResourceValue: value forKey: NSURLIsExcludedFromBackupKey error: &error];

    if (!success) {
      return [self reject:reject withError:error];
    }
  }

  resolve(nil);
}

RCT_EXPORT_METHOD(readFile:(NSString *)filepath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:filepath];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try {
    BOOL fileExists = [[NSFileManager defaultManager] fileExistsAtPath:filepath];

    if (!fileExists) {
      return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
    }

    NSError *error = nil;

    NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:filepath error:&error];

    if (error) {
      return [self reject:reject withError:error];
    }

    if ([attributes objectForKey:NSFileType] == NSFileTypeDirectory) {
      return reject(@"EISDIR", @"EISDIR: illegal operation on a directory, read", nil);
    }

    NSData *content = [[NSFileManager defaultManager] contentsAtPath:filepath];
    NSString *base64Content = [content base64EncodedStringWithOptions:NSDataBase64EncodingEndLineWithLineFeed];

    resolve(base64Content);
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}

RCT_EXPORT_METHOD(read:(NSString *)path
                  length: (double)length
                  position: (double)position
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:path];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try{
    BOOL fileExists = [[NSFileManager defaultManager] fileExistsAtPath:path];

    if (!fileExists) {
        return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", path], nil);
    }

    NSError *error = nil;

    NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:&error];

    if (error) {
        return [self reject:reject withError:error];
    }

    if ([attributes objectForKey:NSFileType] == NSFileTypeDirectory) {
        return reject(@"EISDIR", @"EISDIR: illegal operation on a directory, read", nil);
    }

    // Open the file handler.
    NSFileHandle *file = [NSFileHandle fileHandleForReadingAtPath:path];
    if (file == nil) {
        return reject(@"EISDIR", @"EISDIR: Could not open file for reading", nil);
    }

    // Seek to the position if there is one.
    [file seekToFileOffset: (long)position];

    NSData *content;
    if ((long)length > 0) {
        content = [file readDataOfLength: (long)length];
    } else {
        content = [file readDataToEndOfFile];
    }

    NSString *base64Content = [content base64EncodedStringWithOptions:NSDataBase64EncodingEndLineWithLineFeed];

    resolve(base64Content);
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}

RCT_EXPORT_METHOD(hash:(NSString *)filepath
                  algorithm:(NSString *)algorithm
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:filepath];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try {
    BOOL fileExists = [[NSFileManager defaultManager] fileExistsAtPath:filepath];

    if (!fileExists) {
      return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
    }

    NSError *error = nil;

    NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:filepath error:&error];

    if (error) {
      return [self reject:reject withError:error];
    }

    if ([attributes objectForKey:NSFileType] == NSFileTypeDirectory) {
      return reject(@"EISDIR", @"EISDIR: illegal operation on a directory, read", nil);
    }

    NSData *content = [[NSFileManager defaultManager] contentsAtPath:filepath];

    NSArray *keys = [NSArray arrayWithObjects:@"md5", @"sha1", @"sha224", @"sha256", @"sha384", @"sha512", nil];

    NSArray *digestLengths = [NSArray arrayWithObjects:
      @CC_MD5_DIGEST_LENGTH,
      @CC_SHA1_DIGEST_LENGTH,
      @CC_SHA224_DIGEST_LENGTH,
      @CC_SHA256_DIGEST_LENGTH,
      @CC_SHA384_DIGEST_LENGTH,
      @CC_SHA512_DIGEST_LENGTH,
      nil];

    NSDictionary *keysToDigestLengths = [NSDictionary dictionaryWithObjects:digestLengths forKeys:keys];

    int digestLength = [[keysToDigestLengths objectForKey:algorithm] intValue];

    if (!digestLength) {
      return reject(@"Error", [NSString stringWithFormat:@"Invalid hash algorithm '%@'", algorithm], nil);
    }

    unsigned char buffer[digestLength];

    if ([algorithm isEqualToString:@"md5"]) {
      CC_MD5(content.bytes, (CC_LONG)content.length, buffer);
    } else if ([algorithm isEqualToString:@"sha1"]) {
      CC_SHA1(content.bytes, (CC_LONG)content.length, buffer);
    } else if ([algorithm isEqualToString:@"sha224"]) {
      CC_SHA224(content.bytes, (CC_LONG)content.length, buffer);
    } else if ([algorithm isEqualToString:@"sha256"]) {
      CC_SHA256(content.bytes, (CC_LONG)content.length, buffer);
    } else if ([algorithm isEqualToString:@"sha384"]) {
      CC_SHA384(content.bytes, (CC_LONG)content.length, buffer);
    } else if ([algorithm isEqualToString:@"sha512"]) {
      CC_SHA512(content.bytes, (CC_LONG)content.length, buffer);
    } else {
      return reject(@"Error", [NSString stringWithFormat:@"Invalid hash algorithm '%@'", algorithm], nil);
    }

    NSMutableString *output = [NSMutableString stringWithCapacity:digestLength * 2];
    for(int i = 0; i < digestLength; i++)
      [output appendFormat:@"%02x",buffer[i]];

    resolve(output);
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}


RCT_EXPORT_METHOD(moveFile:(NSString *)from
                  into:(NSString *)into
                  options:(JS::NativeReactNativeFs::FileOptionsT &)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:from];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try {
    NSFileManager *manager = [NSFileManager defaultManager];

    NSError *error = nil;
    BOOL success = [manager moveItemAtPath:from toPath:into error:&error];

    if (!success) {
      return [self reject:reject withError:error];
    }

    if (options.NSFileProtectionKey()) {
      NSMutableDictionary *attributes = [[NSMutableDictionary alloc] init];
      [attributes setValue:options.NSFileProtectionKey() forKey:@"NSFileProtectionKey"];
      BOOL updateSuccess = [manager setAttributes:attributes ofItemAtPath:into error:&error];

      if (!updateSuccess) {
        return [self reject:reject withError:error];
      }
    }

    resolve(nil);
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}


RCT_EXPORT_METHOD(copyFile:(NSString *)from
                  into:(NSString *)into
                  options:(JS::NativeReactNativeFs::FileOptionsT & )options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL fileURLWithPath:from];
  BOOL allowed = [url startAccessingSecurityScopedResource];

  @try {
    NSFileManager *manager = [NSFileManager defaultManager];

    NSError *error = nil;
    BOOL success = [manager copyItemAtPath:from toPath:into error:&error];

    if (!success) {
      return [self reject:reject withError:error];
    }

    if (options.NSFileProtectionKey()) {
      NSMutableDictionary *attributes = [[NSMutableDictionary alloc] init];
      [attributes setValue:options.NSFileProtectionKey() forKey:@"NSFileProtectionKey"];
      BOOL updateSuccess = [manager setAttributes:attributes ofItemAtPath:into error:&error];

      if (!updateSuccess) {
        return [self reject:reject withError:error];
      }
    }

    resolve(nil);
  }
  @finally {
    if (allowed) [url stopAccessingSecurityScopedResource];
  }
}

- (NSArray<NSString *> *)supportedEvents
{
    return @[@"UploadBegin",@"UploadProgress",@"DownloadBegin",@"DownloadProgress",@"DownloadResumable"];
}

RCT_EXPORT_METHOD(downloadFile:(JS::NativeReactNativeFs::NativeDownloadFileOptionsT &)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  RNFSDownloadParams* params = [RNFSDownloadParams alloc];

  NSNumber* jobId = [NSNumber numberWithDouble:options.jobId()];
  params.fromUrl = options.fromUrl();
  params.toFile = options.toFile();
  NSDictionary* headers = options.headers();
  params.headers = headers;
  NSNumber* background = [NSNumber numberWithBool:options.background()];
  params.background = [background boolValue];
  NSNumber* discretionary = [NSNumber numberWithBool:options.discretionary()];
  params.discretionary = [discretionary boolValue];
  NSNumber* cacheable = [NSNumber numberWithBool:options.cacheable()];
  params.cacheable = cacheable ? [cacheable boolValue] : YES;
  NSNumber* progressInterval= [NSNumber numberWithDouble:options.progressInterval()];
  params.progressInterval = progressInterval;
  NSNumber* progressDivider = [NSNumber numberWithDouble:options.progressDivider()];
  params.progressDivider = progressDivider;
  NSNumber* readTimeout = [NSNumber numberWithDouble:options.readTimeout()];
  params.readTimeout = readTimeout;
  NSNumber* backgroundTimeout = [NSNumber numberWithDouble:options.backgroundTimeout()];
  params.backgroundTimeout = backgroundTimeout;
  bool hasBeginCallback = options.hasBeginCallback();
  bool hasProgressCallback = options.hasProgressCallback();
  bool hasResumableCallback = options.hasResumableCallback();

  __block BOOL callbackFired = NO;

  params.completeCallback = ^(NSNumber* statusCode, NSNumber* bytesWritten) {
    if (callbackFired) {
      return;
    }
    callbackFired = YES;

    NSMutableDictionary* result = [[NSMutableDictionary alloc] initWithDictionary: @{@"jobId": jobId}];
    if (statusCode) {
      [result setObject:statusCode forKey: @"statusCode"];
    }
    if (bytesWritten) {
      [result setObject:bytesWritten forKey: @"bytesWritten"];
    }
    return resolve(result);
  };

  params.errorCallback = ^(NSError* error) {
    if (callbackFired) {
      return;
    }
    callbackFired = YES;
    return [self reject:reject withError:error];
  };

  if (hasBeginCallback) {
    params.beginCallback = ^(NSNumber* statusCode, NSNumber* contentLength, NSDictionary* headers) {
        if (self.bridge != nil)
            [self sendEventWithName:@"DownloadBegin" body:@{@"jobId": jobId,
                                                                                            @"statusCode": statusCode,
                                                                                            @"contentLength": contentLength,
                                                                                            @"headers": headers ?: [NSNull null]}];
    };
  }

  if (hasProgressCallback) {
    params.progressCallback = ^(NSNumber* contentLength, NSNumber* bytesWritten) {
        if (self.bridge != nil)
          [self sendEventWithName:@"DownloadProgress"
                                                  body:@{@"jobId": jobId,
                                                          @"contentLength": contentLength,
                                                          @"bytesWritten": bytesWritten}];
    };
  }

  if (hasResumableCallback) {
    params.resumableCallback = ^() {
        if (self.bridge != nil)
            [self sendEventWithName:@"DownloadResumable" body:@{@"jobId": jobId}];
    };
  }

  if (!self.downloaders) self.downloaders = [[NSMutableDictionary alloc] init];

  RNFSDownloader* downloader = [RNFSDownloader alloc];

  NSString *uuid = [downloader downloadFile:params];

  [self.downloaders setValue:downloader forKey:[jobId stringValue]];
    if (uuid) {
        if (!self.uuids) self.uuids = [[NSMutableDictionary alloc] init];
        [self.uuids setValue:uuid forKey:[jobId stringValue]];
    }
}

RCT_EXPORT_METHOD(stopDownload:(double)jobId)
{
  RNFSDownloader* downloader = [self.downloaders objectForKey:[[NSNumber numberWithDouble:jobId] stringValue]];

  if (downloader != nil) {
    [downloader stopDownload];
  }
}

RCT_EXPORT_METHOD(resumeDownload:(double)jobId)
{
    RNFSDownloader* downloader = [self.downloaders objectForKey:[[NSNumber numberWithDouble:jobId] stringValue]];

    if (downloader != nil) {
        [downloader resumeDownload];
    }
}

RCT_EXPORT_METHOD(isResumable:(double)jobId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
)
{
    RNFSDownloader* downloader = [self.downloaders objectForKey:[[NSNumber numberWithDouble:jobId] stringValue]];

    if (downloader != nil) {
        resolve([NSNumber numberWithBool:[downloader isResumable]]);
    } else {
        resolve([NSNumber numberWithBool:NO]);
    }
}

RCT_EXPORT_METHOD(completeHandlerIOS:(double)jobId)
{
    if (self.uuids) {
        NSNumber *jid = [NSNumber numberWithDouble:jobId];
        NSString *uuid = [self.uuids objectForKey:[jid stringValue]];
        CompletionHandler completionHandler = [completionHandlers objectForKey:uuid];
        if (completionHandler) {
            completionHandler();
            [completionHandlers removeObjectForKey:uuid];
        }
    }
}

RCT_EXPORT_METHOD(uploadFiles:(JS::NativeReactNativeFs::NativeUploadFileOptionsT &)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  RNFSUploadParams* params = [RNFSUploadParams alloc];

  NSNumber* jobId = [NSNumber numberWithDouble:options.jobId()];
  params.toUrl = options.toUrl();
  params.files = options.files();

  if (options.binaryStreamOnly().has_value()) {
    params.binaryStreamOnly = options.binaryStreamOnly().value();
  }

  NSDictionary* headers = options.headers();
  NSDictionary* fields = options.fields();
  NSString* method = options.method();
  params.headers = headers;
  params.fields = fields;
  params.method = method;
  bool hasBeginCallback = options.hasBeginCallback();
  bool hasProgressCallback = options.hasProgressCallback();

  params.completeCallback = ^(NSString* body, NSURLResponse *resp) {
    [self.uploaders removeObjectForKey:[jobId stringValue]];

    NSMutableDictionary* result = [[NSMutableDictionary alloc] initWithDictionary: @{@"jobId": jobId,
                                                                                     @"body": body}];
    if ([resp isKindOfClass:[NSHTTPURLResponse class]]) {
      [result setValue:((NSHTTPURLResponse *)resp).allHeaderFields forKey:@"headers"];
      [result setValue:[NSNumber numberWithUnsignedInteger:((NSHTTPURLResponse *)resp).statusCode] forKey:@"statusCode"];
    }
    return resolve(result);
  };

  params.errorCallback = ^(NSError* error) {
    [self.uploaders removeObjectForKey:[jobId stringValue]];
    return [self reject:reject withError:error];
  };

  if (hasBeginCallback) {
    params.beginCallback = ^() {
        if (self.bridge != nil)
          [self sendEventWithName:@"UploadBegin"
                                                  body:@{@"jobId": jobId}];
    };
  }

  if (hasProgressCallback) {
    params.progressCallback = ^(NSNumber* totalBytesExpectedToSend, NSNumber* totalBytesSent) {
        if (self.bridge != nil)
            [self sendEventWithName:@"UploadProgress"
                                                  body:@{@"jobId": jobId,
                                                          @"totalBytesExpectedToSend": totalBytesExpectedToSend,
                                                          @"totalBytesSent": totalBytesSent}];
    };
  }

  if (!self.uploaders) self.uploaders = [[NSMutableDictionary alloc] init];

  RNFSUploader* uploader = [RNFSUploader alloc];

  [uploader uploadFiles:params];

  [self.uploaders setValue:uploader forKey:[jobId stringValue]];
}

RCT_EXPORT_METHOD(stopUpload:(double)jobId)
{
  RNFSUploader* uploader = [self.uploaders objectForKey:[[NSNumber numberWithDouble:jobId] stringValue]];

  if (uploader != nil) {
    [uploader stopUpload];
  }
}

RCT_EXPORT_METHOD(pathForBundle:(NSString *)bundleNamed
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSString *path = [[NSBundle mainBundle].bundlePath stringByAppendingFormat:@"/%@.bundle", bundleNamed];
  NSBundle *bundle = [NSBundle bundleWithPath:path];

  if (!bundle) {
    bundle = [NSBundle bundleForClass:NSClassFromString(bundleNamed)];
    path = bundle.bundlePath;
  }

  if (!bundle.isLoaded) {
    [bundle load];
  }

  if (path) {
    resolve(path);
  } else {
    NSError *error = [NSError errorWithDomain:NSPOSIXErrorDomain
                                         code:NSFileNoSuchFileError
                                     userInfo:nil];

    [self reject:reject withError:error];
  }
}

RCT_EXPORT_METHOD(pathForGroup:(nonnull NSString *)groupId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *groupURL = [[NSFileManager defaultManager]containerURLForSecurityApplicationGroupIdentifier: groupId];

  if (!groupURL) {
    return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no directory for group '%@' found", groupId], nil);
  } else {
    resolve([groupURL path]);
  }
}

RCT_EXPORT_METHOD(getFSInfo:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  unsigned long long totalSpace = 0;
  unsigned long long totalFreeSpace = 0;

  __autoreleasing NSError *error = nil;
  NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSDictionary *dictionary = [[NSFileManager defaultManager] attributesOfFileSystemForPath:[paths lastObject] error:&error];

  if (dictionary) {
    NSNumber *fileSystemSizeInBytes = [dictionary objectForKey: NSFileSystemSize];
    NSNumber *freeFileSystemSizeInBytes = [dictionary objectForKey:NSFileSystemFreeSize];
    totalSpace = [fileSystemSizeInBytes unsignedLongLongValue];
    totalFreeSpace = [freeFileSystemSizeInBytes unsignedLongLongValue];

    resolve(@{
      @"totalSpace": [NSNumber numberWithUnsignedLongLong:totalSpace],
      @"freeSpace": [NSNumber numberWithUnsignedLongLong:totalFreeSpace]
    });
  } else {
    [self reject:reject withError:error];
  }
}

/**
 * iOS Only: copy images from the assets-library (camera-roll) to a specific path, asuming
 * JPEG-Images.
 *
 * Video-Support:
 *
 * One can use this method also to create a thumbNail from a video.
 * Currently it is impossible to specify a concrete position, the OS will decide wich
 * Thumbnail you'll get then.
 * To copy a video from assets-library and save it as a mp4-file, use the method
 * copyAssetsVideoIOS.
 *
 * It is also supported to scale the image via scale-factor (0.0-1.0) or with a specific
 * width and height. Also the resizeMode will be considered.
 */
RCT_EXPORT_METHOD(copyAssetsFileIOS: (NSString *) imageUri
                  destPath: (NSString *) destination
                  width: (double) width
                  height: (double) height
                  scale: (double) scale
                  compression: (double) compression
                  resizeMode: (NSString*) resizeMode
                  resolve: (RCTPromiseResolveBlock) resolve
                  reject: (RCTPromiseRejectBlock) reject)

{
// [PHAsset fetchAssetsWithALAssetURLs] is deprecated and not supported in Mac Catalyst
# if !TARGET_OS_UIKITFORMAC && !TARGET_OS_OSX
    CGSize size = CGSizeMake(width, height);

    NSURL* url = [NSURL URLWithString:imageUri];
    PHFetchResult *results = nil;
    if ([url.scheme isEqualToString:@"ph"]) {
        results = [PHAsset fetchAssetsWithLocalIdentifiers:@[[imageUri substringFromIndex: 5]] options:nil];
    } else {
        results = [PHAsset fetchAssetsWithALAssetURLs:@[url] options:nil];
    }

    if (results.count == 0) {
        NSString *errorText = [NSString stringWithFormat:@"Failed to fetch PHAsset with local identifier %@ with no error message.", imageUri];

        NSMutableDictionary* details = [NSMutableDictionary dictionary];
        [details setValue:errorText forKey:NSLocalizedDescriptionKey];
        NSError *error = [NSError errorWithDomain:@"RNFS" code:500 userInfo:details];
        [self reject: reject withError:error];
        return;
    }

    PHAsset *asset = [results firstObject];
    PHImageRequestOptions *imageOptions = [PHImageRequestOptions new];

    // Allow us to fetch images from iCloud
    imageOptions.networkAccessAllowed = YES;


    // Note: PhotoKit defaults to a deliveryMode of PHImageRequestOptionsDeliveryModeOpportunistic
    // which means it may call back multiple times - we probably don't want that
    imageOptions.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;

    BOOL useMaximumSize = CGSizeEqualToSize(size, CGSizeZero);
    CGSize targetSize;
    if (useMaximumSize) {
        targetSize = PHImageManagerMaximumSize;
        imageOptions.resizeMode = PHImageRequestOptionsResizeModeNone;
    } else {
        targetSize = CGSizeApplyAffineTransform(size, CGAffineTransformMakeScale(scale, scale));
        imageOptions.resizeMode = PHImageRequestOptionsResizeModeExact;
    }

    PHImageContentMode contentMode = PHImageContentModeAspectFill;
    if ([resizeMode compare:@"contain"] == NSOrderedSame) {
        contentMode = PHImageContentModeAspectFit;
    }

    // PHImageRequestID requestID =
    [[PHImageManager defaultManager] requestImageForAsset:asset
                                               targetSize:targetSize
                                              contentMode:contentMode
                                                  options:imageOptions
                                            resultHandler:^(UIImage *result, NSDictionary<NSString *, id> *info) {
        if (result) {

            NSData *imageData = UIImageJPEGRepresentation(result, compression );
            [imageData writeToFile:destination atomically:YES];
            resolve(destination);

        } else {
            NSMutableDictionary* details = [NSMutableDictionary dictionary];
            [details setValue:info[PHImageErrorKey] forKey:NSLocalizedDescriptionKey];
            NSError *error = [NSError errorWithDomain:@"RNFS" code:501 userInfo:details];
            [self reject: reject withError:error];

        }
    }];
# else
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"copyAssetsFileIOS() is not supported for macOS"];
# endif
}

/**
 * iOS Only: copy videos from the assets-library (camera-roll) to a specific path as mp4-file.
 *
 * To create a thumbnail from the video, refer to copyAssetsFileIOS
 */
RCT_EXPORT_METHOD(copyAssetsVideoIOS: (NSString *) imageUri
                  destPath: (NSString *) destination
                  resolve: (RCTPromiseResolveBlock) resolve
                  reject: (RCTPromiseRejectBlock) reject)
{
// [PHAsset fetchAssetsWithALAssetURLs] is deprecated and not supported in Mac Catalyst
# if !TARGET_OS_UIKITFORMAC && !TARGET_OS_OSX
  NSURL* url = [NSURL URLWithString:imageUri];
  //unused?
  //__block NSURL* videoURL = [NSURL URLWithString:destination];
  __block NSError *error = nil;

  PHFetchResult *phAssetFetchResult = nil;
  if ([url.scheme isEqualToString:@"ph"]) {
      phAssetFetchResult = [PHAsset fetchAssetsWithLocalIdentifiers:@[[imageUri substringFromIndex: 5]] options:nil];
  } else {
      phAssetFetchResult = [PHAsset fetchAssetsWithALAssetURLs:@[url] options:nil];
  }

  PHAsset *phAsset = [phAssetFetchResult firstObject];

  PHVideoRequestOptions *options = [[PHVideoRequestOptions alloc] init];
  options.networkAccessAllowed = YES;
  options.version = PHVideoRequestOptionsVersionOriginal;
  options.deliveryMode = PHVideoRequestOptionsDeliveryModeAutomatic;

  dispatch_group_t group = dispatch_group_create();
  dispatch_group_enter(group);

  [[PHImageManager defaultManager] requestAVAssetForVideo:phAsset options:options resultHandler:^(AVAsset *asset, AVAudioMix *audioMix, NSDictionary *info) {

    if ([asset isKindOfClass:[AVURLAsset class]]) {
      NSURL *url = [(AVURLAsset *)asset URL];
      NSLog(@"Final URL %@",url);
      BOOL writeResult = false;
        
      if (@available(iOS 9.0, *)) {
          NSURL *destinationUrl = [NSURL fileURLWithPath:destination relativeToURL:nil];
          writeResult = [[NSFileManager defaultManager] copyItemAtURL:url toURL:destinationUrl error:&error];
      } else {
          NSData *videoData = [NSData dataWithContentsOfURL:url];
          writeResult = [videoData writeToFile:destination options:NSDataWritingAtomic error:&error];
      }
        
      if(writeResult) {
        NSLog(@"video success");
      }
      else {
        NSLog(@"video failure");
      }
      dispatch_group_leave(group);
    }
  }];
  dispatch_group_wait(group,  DISPATCH_TIME_FOREVER);

  if (error) {
    NSLog(@"RNFS: %@", error);
    return [self reject:reject withError:error];
  }

  return resolve(destination);
# else
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"copyAssetsVideoIOS() is not supported for macOS"];
# endif
}

RCT_EXPORT_METHOD(touch:(NSString*)filepath
                  options:(JS::NativeReactNativeFs::TouchOptions &) options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSFileManager *manager = [NSFileManager defaultManager];
    BOOL exists = [manager fileExistsAtPath:filepath isDirectory:NULL];

    if (!exists) {
        return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file, open '%@'", filepath], nil);
    }

    NSMutableDictionary *attr = [NSMutableDictionary dictionary];

    if (options.mtime().has_value()) {
      // NOTE: Mind that the timestamp from the JS layer is in milliseconds,
      // and NSDate constructor expects seconds, thus the division by 1000.
      NSDate *mtime = [NSDate dateWithTimeIntervalSince1970:options.mtime().value() / 1000];
      [attr setValue:mtime forKey:NSFileModificationDate];
    }
    if (options.ctime().has_value()) {
      NSDate *ctime = [NSDate dateWithTimeIntervalSince1970:options.ctime().value() / 1000];
      [attr setValue:ctime forKey:NSFileCreationDate];
    }

    NSError *error = nil;
    BOOL success = [manager setAttributes:attr ofItemAtPath:filepath error:&error];

    if (!success) {
        return [self reject:reject withError:error];
    }

    resolve(nil);
}

- (NSNumber *)dateToTimeIntervalNumber:(NSDate *)date
{
  return @([date timeIntervalSince1970]);
}

- (void)reject:(RCTPromiseRejectBlock)reject withError:(NSError *)error
{
  NSString *codeWithDomain = [NSString stringWithFormat:@"E%@%zd", error.domain.uppercaseString, error.code];
  reject(codeWithDomain, error.localizedDescription, error);
}

- (NSString *)getPathForDirectory:(NSSearchPathDirectory)directory
{
  NSArray *paths = NSSearchPathForDirectoriesInDomains(directory, NSUserDomainMask, YES);
  return [paths firstObject];
}

- (NSDictionary *)constantsToExport
{
  return @{
           @"MainBundlePath": [[NSBundle mainBundle] bundlePath],
           @"CachesDirectoryPath": [self getPathForDirectory:NSCachesDirectory],
           @"DocumentDirectoryPath": [self getPathForDirectory:NSDocumentDirectory],
           @"ExternalDirectoryPath": [NSNull null],
           @"ExternalStorageDirectoryPath": [NSNull null],
           @"TemporaryDirectoryPath": NSTemporaryDirectory(),
           @"LibraryDirectoryPath": [self getPathForDirectory:NSLibraryDirectory],
           @"FileTypeRegular": NSFileTypeRegular,
           @"FileTypeDirectory": NSFileTypeDirectory,
           @"FileProtectionComplete": NSFileProtectionComplete,
           @"FileProtectionCompleteUnlessOpen": NSFileProtectionCompleteUnlessOpen,
           @"FileProtectionCompleteUntilFirstUserAuthentication": NSFileProtectionCompleteUntilFirstUserAuthentication,
           @"FileProtectionNone": NSFileProtectionNone
          };
}

- (NSDictionary *) getConstants {
  return [self constantsToExport];
}

- (void)copyFileAssets:(NSString *)from into:(NSString *)into resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"copyFileAssets()"];
}

- (void)copyFileRes:(NSString *)from into:(NSString *)into resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"copyFileRes()"];
}

- (void)copyFolder:(NSString *)from into:(NSString *)into resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"copyFolder()"];
}

- (void)existsAssets:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"existsAssets()"];
}

- (void)existsRes:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"existsRes()"];
}

- (void)getAllExternalFilesDirs:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"getAllExternalFilesDirs()"];
}

- (void)readFileAssets:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"readFileAssets()"];
}

- (void)readFileRes:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"readFileRes()"];
}

- (void)scanFile:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"scanFile()"];
}

- (void)scanFile:(NSString *)filepath readable:(BOOL)readable ownerOnly:(BOOL)ownerOnly resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"scanFile()"];
}

- (void)readDirAssets:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"readDirAssets()"];
}


- (void)setReadable:(NSString *)filepath readable:(BOOL)readable ownerOnly:(BOOL)ownerOnly resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [[RNFSException NOT_IMPLEMENTED] reject:reject details:@"setReadable()"];
}

- (void)documentPicker:(UIDocumentPickerViewController *)picker
didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls
{
  NSValue *id = [NSValue valueWithPointer:(void*)picker];
  NSArray *promise = pendingPickFilePromises[id];
  if (promise != nil) {
    [pendingPickFilePromises removeObjectForKey:id];
    RCTPromiseResolveBlock resolve = promise[0];
    NSMutableArray *res = [NSMutableArray arrayWithCapacity:urls.count];
    for (int i = 0; i < urls.count; ++i) {
      [res addObject:urls[i].absoluteString];
    }
    resolve(res);
  }
  // TODO: Should crash here, as it is a fatal error.
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)picker
{
  NSValue *id = [NSValue valueWithPointer:(void*)picker];
  NSArray *promise = pendingPickFilePromises[id];
  if (promise != nil) {
    [pendingPickFilePromises removeObjectForKey:id];
    RCTPromiseResolveBlock resolve = promise[0];
    resolve(@[]);
  }
  // TODO: Should crash here, as it is a fatal error.
}

RCT_EXPORT_METHOD(
#ifdef RCT_NEW_ARCH_ENABLED
                  pickFile:(JS::NativeReactNativeFs::PickFileOptionsT &)options
#else
                  pickFile:(NSDictionary*)options
#endif
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
) {
  dispatch_async(dispatch_get_main_queue(), ^() {
    @try {
      UIDocumentPickerViewController *picker;

#   ifdef RCT_NEW_ARCH_ENABLED
      facebook::react::LazyVector<NSString*> mimeTypes = options.mimeTypes();
      int numMimeTypes = mimeTypes.size();
#   else
      NSArray<NSString*>* mimeTypes = options[@"mimeTypes"];
      int numMimeTypes = mimeTypes.count;
#   endif

      if (@available(iOS 14.0, *)) {
        NSMutableArray<UTType*> *types = [NSMutableArray arrayWithCapacity:numMimeTypes];
        for (int i = 0; i < numMimeTypes; ++i) {
          NSString *mime = mimeTypes[i];
          UTType *type;
          if ([mime isEqual:@"*/*"]) type = UTTypeItem;
          else type = [UTType typeWithMIMEType:mime];
          [types addObject:type];
        }
        picker = [[UIDocumentPickerViewController alloc]
                  initForOpeningContentTypes:types];
      } else {
        // TODO: There is no UTType object on iOS < 14.0, just UTType strings that
        // can be found here:
        // https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/UTIRef/Articles/System-DeclaredUniformTypeIdentifiers.html#//apple_ref/doc/uid/TP40009259-SW1
        // though I have not found a function for converting MIME types into UTTypes
        // on iOS < 14.0. If the only option is to implement this conversion ourselves,
        // at least for now we can leave without iOS < 14.0 support (RN presumably
        // supports iOS 13.4 and above, but according to Wiki iOS 13.x are considered
        // obsolete by now, and presumably all devices running iOS 13.x originally
        // have been upgraded to iOS 14+ by now).
        [[RNFSException NOT_IMPLEMENTED]
         reject:reject details:@"pickFile() is implemented for iOS 14+ only"];
        return;
      }

      UIViewController *root = RCTPresentedViewController();

      // Note: This is needed because the module overall runs on a dedicated queue
      // (see its methodQueue() method below), while interaction with UI should be
      // done on the main thread queue.

      picker.delegate = self;
      [pendingPickFilePromises setObject:@[resolve, reject]
                                  forKey:[NSValue valueWithPointer:(void*)picker]];
      [root presentViewController:picker animated:YES completion:nil];
    }
    @catch (NSException *e) {
      [[RNFSException from:e] reject:reject];
    }
  });
}

+(void)setCompletionHandlerForIdentifier: (NSString *)identifier completionHandler: (CompletionHandler)completionHandler
{
    if (!completionHandlers) completionHandlers = [[NSMutableDictionary alloc] init];
    [completionHandlers setValue:completionHandler forKey:identifier];
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_queue_create("pe.lum.newrnfs", DISPATCH_QUEUE_SERIAL);
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeReactNativeFsSpecJSI>(params);
}
#endif

@end
